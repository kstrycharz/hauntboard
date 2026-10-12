"""Verify the config identity of a single Docker-save image across image stores."""
import hashlib
import json
import re
import sys
import tarfile

expected = sys.argv[1]
assert re.fullmatch(r"sha256:[a-f0-9]{64}", expected)
hashes = {}
manifest = None
with tarfile.open(fileobj=sys.stdin.buffer, mode="r|") as archive:
    for member in archive:
        if not member.isfile() or member.size > 2 * 1024 * 1024:
            continue
        content = archive.extractfile(member).read()
        hashes[member.name] = hashlib.sha256(content).hexdigest()
        if member.name == "manifest.json":
            manifest = json.loads(content)
assert manifest is not None and len(manifest) == 1, "Expected one image"
config = manifest[0]["Config"]
assert hashes.get(config) == expected.removeprefix("sha256:"), "Image config changed"
print("Loaded image config matches the checksummed GitHub build.")
