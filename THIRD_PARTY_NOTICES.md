# Third-party components

LanYue bundles an adapted kkFileView engine from https://github.com/kekingcn/kkFileView at cd127fd8559970a28cd4d513f68e41b1bfdc966a. The upstream Apache-2.0 license is in licenses/kkFileView-LICENSE. Desktop changes and build instructions are provided in engine-overlay/ and scripts/ in the source distribution.

Electron is MIT licensed; Chromium notices accompany the Electron distribution. The Java runtime preserves its legal/ directory. LibreOffice preserves its LICENSE, NOTICE, and other distribution notices. 7-Zip preserves its license with the runtime. Embedded Java and browser libraries retain their upstream notices in the engine JAR and resources.

CAD conversion uses upstream Aspose.CAD. No commercial redistribution license has been supplied for this development build. Evaluation output and restrictions are retained. Before commercial distribution, obtain and verify the appropriate vendor license and review every bundled component's redistribution obligations. This development build must not be represented as a fully licensed commercial release.

This notice is a component inventory, not a completed redistribution audit.

The portable updater uses yauzl (MIT) and its pend dependency (MIT) to inspect ZIP entries before extraction. Their original license files are preserved with the packaged Node.js dependencies.

The macOS archive adapter bundles the official 7-Zip 26.03 console build from https://github.com/ip7z/7zip/releases/tag/26.03. Its full notice is preserved at runtime/licenses/7zip-LICENSE.txt, including LGPL, BSD terms and the unRAR restriction. The RAR decompression code may not be used to develop a RAR (WinRAR) compatible archiver. Corresponding upstream source is available in that release. The bundled executable is copied without modification; it includes RAR decoders that may be omitted from third-party builds.
