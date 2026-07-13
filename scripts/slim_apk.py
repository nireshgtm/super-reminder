#!/usr/bin/env python3
"""
Strips x86 and x86_64 native libraries from an APK.
These ABIs are emulator-only — no real Android phone needs them.

Usage:
  python3 scripts/slim_apk.py input.apk output-slim.apk
"""
import sys
import zipfile
import os

def slim(src: str, dst: str) -> None:
    skip = ('lib/x86/', 'lib/x86_64/')
    removed = 0

    with zipfile.ZipFile(src, 'r') as zin:
        with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                if any(item.filename.startswith(p) for p in skip):
                    print(f"  removed  {item.filename}")
                    removed += 1
                else:
                    zout.writestr(item, zin.read(item.filename))

    before = os.path.getsize(src) / 1_048_576
    after  = os.path.getsize(dst) / 1_048_576
    print(f"\n{before:.1f} MB  →  {after:.1f} MB  (removed {removed} files)")

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print("Usage: python3 slim_apk.py input.apk output-slim.apk")
        sys.exit(1)
    slim(sys.argv[1], sys.argv[2])
