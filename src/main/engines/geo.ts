import { readFile, writeFile } from 'node:fs/promises';
import { extensionOf } from '../../shared/formats';
import { JobError, type Engine } from '../jobs/types';
import { nodeRequire } from './req';

const INPUTS = new Set(['geojson', 'kml', 'gpx']);
const OUTPUTS = new Set(['geojson', 'kml', 'gpx', 'csv']);

interface Feature {
  type: 'Feature';
  properties: Record<string, unknown> | null;
  geometry: { type: string; coordinates?: unknown; geometries?: unknown[] } | null;
}
interface Collection {
  type: 'FeatureCollection';
  features: Feature[];
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Anything GeoJSON may hold, as a list of features. */
export function toCollection(value: unknown): Collection {
  const v = value as { type?: string; features?: Feature[]; geometry?: unknown } | null;
  if (v?.type === 'FeatureCollection' && Array.isArray(v.features))
    return { type: 'FeatureCollection', features: v.features };
  if (v?.type === 'Feature')
    return { type: 'FeatureCollection', features: [v as unknown as Feature] };
  if (v && typeof v.type === 'string')
    return {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: v as unknown as Feature['geometry'] },
      ],
    };
  throw new JobError('E_CORRUPT_INPUT', 'this is not GeoJSON');
}

function parseXml(text: string): Document {
  const { DOMParser } = nodeRequire('@xmldom/xmldom') as typeof import('@xmldom/xmldom');
  return new DOMParser({ onError: () => undefined }).parseFromString(
    text,
    'text/xml',
  ) as unknown as Document;
}

export function readGeo(text: string, ext: string): Collection {
  try {
    if (ext === 'geojson') return toCollection(JSON.parse(text));
    const togeojson = nodeRequire('@tmcw/togeojson') as typeof import('@tmcw/togeojson');
    const dom = parseXml(text);
    const out = (ext === 'kml' ? togeojson.kml(dom) : togeojson.gpx(dom)) as unknown;
    return toCollection(out);
  } catch (error) {
    if (error instanceof JobError) throw error;
    throw new JobError('E_CORRUPT_INPUT', error instanceof Error ? error.message : 'geo data');
  }
}

/** GPX: points become waypoints, lines become tracks, and everything else is described in the notes. */
export function toGpx(c: Collection): string {
  const wpt: string[] = [];
  const trk: string[] = [];
  const name = (f: Feature): string => {
    const n = f.properties?.name;
    return typeof n === 'string' && n !== '' ? `<name>${esc(n)}</name>` : '';
  };
  const seg = (coords: number[][]): string =>
    `<trkseg>${coords.map((p) => `<trkpt lat="${p[1]}" lon="${p[0]}">${p[2] !== undefined ? `<ele>${p[2]}</ele>` : ''}</trkpt>`).join('')}</trkseg>`;
  const visit = (f: Feature, g: Feature['geometry']): void => {
    if (!g) return;
    const co = g.coordinates as never;
    if (g.type === 'Point') {
      const p = co as number[];
      wpt.push(
        `<wpt lat="${p[1]}" lon="${p[0]}">${p[2] !== undefined ? `<ele>${p[2]}</ele>` : ''}${name(f)}</wpt>`,
      );
    } else if (g.type === 'MultiPoint')
      (co as number[][]).forEach((p) => visit(f, { type: 'Point', coordinates: p }));
    else if (g.type === 'LineString') trk.push(`<trk>${name(f)}${seg(co as number[][])}</trk>`);
    else if (g.type === 'MultiLineString')
      trk.push(`<trk>${name(f)}${(co as number[][][]).map(seg).join('')}</trk>`);
    else if (g.type === 'Polygon')
      trk.push(`<trk>${name(f)}${(co as number[][][]).map(seg).join('')}</trk>`);
    else if (g.type === 'MultiPolygon')
      trk.push(`<trk>${name(f)}${(co as number[][][][]).flat().map(seg).join('')}</trk>`);
    else if (g.type === 'GeometryCollection')
      (g.geometries as Feature['geometry'][]).forEach((x) => visit(f, x));
  };
  for (const f of c.features) visit(f, f.geometry);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Convert" xmlns="http://www.topografix.com/GPX/1/1">\n${[...wpt, ...trk].join('\n')}\n</gpx>\n`;
}

const kmlCoords = (pts: number[][]): string =>
  `<coordinates>${pts.map((p) => `${p[0]},${p[1]}${p[2] !== undefined ? `,${p[2]}` : ''}`).join(' ')}</coordinates>`;

function kmlGeometry(g: NonNullable<Feature['geometry']>): string {
  const co = g.coordinates as never;
  switch (g.type) {
    case 'Point':
      return `<Point>${kmlCoords([co as number[]])}</Point>`;
    case 'LineString':
      return `<LineString>${kmlCoords(co as number[][])}</LineString>`;
    case 'Polygon': {
      const [outer, ...holes] = co as number[][][];
      return `<Polygon><outerBoundaryIs><LinearRing>${kmlCoords(outer ?? [])}</LinearRing></outerBoundaryIs>${holes
        .map((h) => `<innerBoundaryIs><LinearRing>${kmlCoords(h)}</LinearRing></innerBoundaryIs>`)
        .join('')}</Polygon>`;
    }
    case 'MultiPoint':
      return `<MultiGeometry>${(co as number[][]).map((p) => kmlGeometry({ type: 'Point', coordinates: p })).join('')}</MultiGeometry>`;
    case 'MultiLineString':
      return `<MultiGeometry>${(co as number[][][]).map((l) => kmlGeometry({ type: 'LineString', coordinates: l })).join('')}</MultiGeometry>`;
    case 'MultiPolygon':
      return `<MultiGeometry>${(co as number[][][][]).map((p) => kmlGeometry({ type: 'Polygon', coordinates: p })).join('')}</MultiGeometry>`;
    case 'GeometryCollection':
      return `<MultiGeometry>${((g.geometries ?? []) as NonNullable<Feature['geometry']>[]).map(kmlGeometry).join('')}</MultiGeometry>`;
    default:
      return '';
  }
}

/** KML: each feature is a placemark with its name, its other properties as a description, and its shape. */
export function toKml(c: Collection): string {
  const marks = c.features
    .filter((f) => f.geometry)
    .map((f) => {
      const { name, ...rest } = (f.properties ?? {}) as Record<string, unknown>;
      const description = Object.entries(rest)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join('\n');
      return `<Placemark>${typeof name === 'string' && name !== '' ? `<name>${esc(name)}</name>` : ''}${description ? `<description>${esc(description)}</description>` : ''}${kmlGeometry(f.geometry as NonNullable<Feature['geometry']>)}</Placemark>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n${marks.join('\n')}\n</Document></kml>\n`;
}

/** A table: one row per feature, its properties, and longitude/latitude for points (the geometry as JSON otherwise). */
export function toRows(c: Collection): (string | number)[][] {
  const props: string[] = [];
  for (const f of c.features)
    for (const k of Object.keys(f.properties ?? {})) if (!props.includes(k)) props.push(k);
  const cell = (v: unknown): string | number =>
    v === null || v === undefined
      ? ''
      : typeof v === 'object'
        ? JSON.stringify(v)
        : (v as string | number);
  const rows = c.features.map((f) => {
    const g = f.geometry;
    const point = g?.type === 'Point' ? (g.coordinates as number[]) : null;
    return [
      ...props.map((p) => cell(f.properties?.[p])),
      point ? (point[0] ?? '') : '',
      point ? (point[1] ?? '') : '',
      point || !g ? '' : JSON.stringify(g),
    ];
  });
  return [[...props, 'longitude', 'latitude', 'geometry'], ...rows];
}

/** GeoJSON, KML and GPX into each other, and into a CSV table. */
export const geoEngine: Engine = {
  id: 'geo',
  canHandle: (op, input) =>
    op.kind === 'convert' &&
    INPUTS.has(extensionOf(input)) &&
    OUTPUTS.has(op.id) &&
    extensionOf(input) !== op.id,
  async run(op, input, ctx) {
    const text = (await readFile(input, 'utf8')).replace(/^﻿/, '');
    const c = readGeo(text, extensionOf(input));
    if (c.features.length === 0)
      throw new JobError('E_UNSUPPORTED', 'there is nothing on the map to convert');
    if (op.id === 'geojson')
      return writeFile(ctx.tempPath, JSON.stringify(c, null, 2) + '\n', 'utf8');
    if (op.id === 'gpx') return writeFile(ctx.tempPath, toGpx(c), 'utf8');
    if (op.id === 'csv') {
      const Papa = nodeRequire('papaparse') as typeof import('papaparse');
      return writeFile(ctx.tempPath, `﻿${Papa.unparse(toRows(c), { newline: '\r\n' })}`, 'utf8');
    }
    return writeFile(ctx.tempPath, toKml(c), 'utf8');
  },
};
