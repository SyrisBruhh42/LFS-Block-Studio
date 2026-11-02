"""Independent downloaded-file oracle: Python stdlib ZIP/JSON/hashlib, no App imports."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key: " + key)
        result[key] = value
    return result


path = Path(sys.argv[1])
raw = path.read_bytes()
assert len(raw) <= 4 * 1024 * 1024
with zipfile.ZipFile(path) as archive:
    rows = archive.infolist()
    assert len(rows) == 4
    assert set(archive.namelist()) == {"manifest.json", "resources.json", "LICENSE.txt", "NOTICES.txt"}
    assert sum(row.file_size for row in rows) <= 8 * 1024 * 1024
    assert archive.testzip() is None
    files = {name: archive.read(name) for name in archive.namelist()}
    methods = sorted(set(row.compress_type for row in rows))
manifest = json.loads(files["manifest.json"].decode("utf-8"), object_pairs_hook=unique_object)
resources = json.loads(files["resources.json"].decode("utf-8"), object_pairs_hook=unique_object)
assert manifest["format"] == "lfs-studio-kit" and manifest["version"] == 1
assert resources["format"] == "lfs-studio-kit-resources" and resources["version"] == 1
assert manifest["units"] == "studio-studs-plates" and manifest["axes"] == "x-right-y-up-z-forward"
assert {row["path"] for row in manifest["files"]} == {"resources.json", "LICENSE.txt", "NOTICES.txt"}
for row in manifest["files"]:
    value = files[row["path"]]
    assert len(value) == row["bytes"]
    assert hashlib.sha256(value).hexdigest() == row["sha256"]
definitions = {row["id"]: row for row in resources["definitions"]}
assert len(definitions) == len(resources["definitions"])
assert len({row["id"] for row in resources["blueprints"]}) == len(resources["blueprints"])
for blueprint in resources["blueprints"]:
    assert blueprint["isPublic"] is False
    for definition in blueprint["customBlockDefs"]:
        assert definitions[definition["id"]] == definition
    for block in blueprint["blocks"]:
        assert block["blockDefId"] in definitions
result = {"manifest": manifest, "resources": resources, "licenseText": files["LICENSE.txt"].decode("utf-8"), "notices": files["NOTICES.txt"].decode("utf-8"), "archiveSha256": hashlib.sha256(raw).hexdigest(), "archiveBytes": len(raw), "entryMethods": methods, "scope": "Independent actual ZIP bytes/CRC/hash/reference readback only; no legal ownership, native, UI or release acceptance."}
print(json.dumps(result))
