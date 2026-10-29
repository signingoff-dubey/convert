import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ToolWindowName } from '../../shared/ipc';
import { on } from '../shared/api';
import { useSettings } from '../shared/store';
import '../theme/tokens.css';
import { AddBg } from './tools/AddBg';
import { Annotate } from './tools/Annotate';
import { Collage } from './tools/Collage';
import { Compress } from './tools/Compress';
import { Crop } from './tools/Crop';
import { Edit } from './tools/Edit';
import { Merge } from './tools/Merge';
import { Metadata } from './tools/Metadata';
import { Redact } from './tools/Redact';
import { Split } from './tools/Split';
import { Trim } from './tools/Trim';

const TOOLS: Record<ToolWindowName, (p: { paths: string[] }) => React.ReactNode> = {
  trim: Trim,
  split: Split,
  merge: Merge,
  compress: Compress,
  redact: Redact,
  metadata: Metadata,
  edit: Edit,
  crop: Crop,
  'add-bg': AddBg,
  annotate: Annotate,
  collage: Collage,
};

function App() {
  const init = useSettings((s) => s.init);
  const [job, setJob] = useState<{ tool: ToolWindowName; paths: string[] } | null>(null);
  useEffect(() => {
    void init();
    return on<{ tool: ToolWindowName; paths: string[] }>('toolwin:init', setJob);
  }, [init]);
  if (!job) return null;
  const Tool = TOOLS[job.tool];
  return <Tool paths={job.paths} />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
