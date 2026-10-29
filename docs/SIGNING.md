# Code signing

Convert installs and runs without a signature, but Windows SmartScreen shows a warning for unsigned installers, and some antivirus products are suspicious of any program that installs a global input hook. Signing reduces both.

`package.bat` does not require a certificate. To sign:

1. Get a code-signing certificate (a `.pfx` file) from a certificate authority.
2. Before running `package.bat`, set two environment variables in the same window:

```bat
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password
```

3. Run `package.bat`. electron-builder signs the app and the installer.

Never commit the certificate or the password. Convert has no signing code of its own and nothing in the app depends on the signature.
