# Python 3.11-compatible safe extraction of the separately SHA-256-pinned
# official runtime archive. No links, devices, absolute paths or traversal.
import os, pathlib, shutil, sys, tarfile
root=pathlib.Path('/opt/gvisor')
root.mkdir(mode=0o755,exist_ok=True)
with tarfile.open(sys.argv[1]) as archive:
    for item in archive:
        path=pathlib.PurePosixPath(item.name)
        if path.is_absolute() or '..' in path.parts or not (item.isfile() or item.isdir()):
            raise RuntimeError('Unsafe runtime archive member')
        dest=root.joinpath(*path.parts)
        if item.isdir():
            dest.mkdir(parents=True,exist_ok=True,mode=0o755)
        else:
            dest.parent.mkdir(parents=True,exist_ok=True,mode=0o755)
            with archive.extractfile(item) as source, open(dest,'xb') as output:
                shutil.copyfileobj(source,output)
            os.chmod(dest,item.mode & 0o755)
