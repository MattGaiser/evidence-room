"""Exercise the real worker with a local provider fixture; never access the network."""

import importlib.util
import io
import json
import os
from pathlib import Path
import sys

spec = importlib.util.spec_from_file_location("actual_review", Path.cwd() / "actual_review.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
os.environ["OPENAI_API_KEY"] = "contract-test"
os.environ["OPENAI_MODEL"] = "contract-test"


def provider(http, timeout):
    payload = json.loads(http.data)
    request = json.loads(payload["input"])
    schema = payload["text"]["format"]["schema"]
    finding = schema["properties"]["criteria"]["items"]
    assert finding["properties"]["criterionId"]["enum"] == [c["id"] for c in request["criteria"]]
    evidence = finding["properties"]["evidence"]["items"]
    assert evidence["properties"]["paragraphId"]["enum"] == [p["id"] for p in request["paragraphs"]]
    assert "explanation" in evidence["required"]
    assert payload["store"] is False and payload["text"]["format"]["strict"] is True
    result = {"status": "completed", "output": [{"content": [{"type": "output_text", "text": Path("provider.json").read_text()}]}]}
    return io.BytesIO(json.dumps(result).encode())


actual_review = worker.review


def review_with_local_provider(request):
    return actual_review(request, opener=provider)


# Keep the real stdin limits, envelope emission, error translation and exit code.
worker.review = review_with_local_provider
sys.exit(worker.main())
