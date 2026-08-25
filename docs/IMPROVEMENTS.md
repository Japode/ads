# Improvements

## Block F — Metrics, quality and operations

### §RK34 Quantizing needs a toolchain, not a resize

The budget is set at 40KB for a page view and the shipped worst case is 31KB, of which
the viglet logo alone is 20KB. Resizing from 256px to the 128px the banner can actually
use cut it from 35KB, and it is still two thirds of everything a reader downloads.

The remaining win is quantization, and it needs a tool this project does not have. The
resize went through .NET's encoder, which writes 32-bit RGBA and made claude-tray larger
than the 256px original it replaced — that file is still unresized for exactly this
reason. A palette encoder would take viglet to single digits and claude-tray below what
it is now.

So this is a dependency question rather than an image question: an image toolchain in
devDependencies, run once and committed, versus a static-files project that currently
installs nothing but a schema validator. Whatever is chosen, the per-logo ceiling the
tests now enforce is what keeps the answer honest.
