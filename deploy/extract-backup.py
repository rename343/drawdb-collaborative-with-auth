"""Extract a data backup without allowing paths or links outside its directory."""

import sys
import tarfile


def data_member(member, destination):
    # data_filter rejects device files, traversal, and escaping links. Keep
    # numeric ownership so node can use the restored bind mount on the VM.
    filtered = tarfile.data_filter(member, destination)
    if filtered is not None:
        filtered = filtered.replace(
            uid=member.uid, gid=member.gid, uname=None, gname=None
        )
        if member.isdir():
            filtered.mode = member.mode & 0o777
    return filtered


if __name__ == "__main__":
    with tarfile.open(sys.argv[1], "r:gz") as archive:
        archive.extractall(
            sys.argv[2], numeric_owner=True, filter=data_member
        )
