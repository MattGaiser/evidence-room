import copy
import json
import os
import io
from pathlib import Path
import unittest
from unittest.mock import patch

from review import ReviewError, extract, main, review, schema, validate_input, validate_review

DATA = json.loads((Path(__file__).resolve().parent.parent / "data" / "competition.json").read_text(encoding="utf-8"))


class ReviewContractTests(unittest.TestCase):
    def setUp(self):
        self.request = {"brief": DATA["brief"], "criteria": DATA["criteria"], "paragraphs": copy.deepcopy(DATA["submissions"][0]["paragraphs"])}
        self.content = copy.deepcopy(DATA["submissions"][0]["exampleReview"])

    def test_all_seed_examples_validate(self):
        for entry in DATA["submissions"]:
            request = dict(self.request, paragraphs=entry["paragraphs"])
            validate_review(entry["exampleReview"], request)

    def test_invented_quote_rejected(self):
        self.content["criteria"][0]["evidence"][0]["quote"] = "Independent laboratory certification confirmed."
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_each_quote_requires_a_bounded_explanation(self):
        for explanation in [None, "", "   ", 42, {}, "x" * 801]:
            with self.subTest(explanation=explanation):
                content = copy.deepcopy(self.content)
                content["criteria"][0]["evidence"][0]["explanation"] = explanation
                with self.assertRaises(ReviewError):
                    validate_review(content, self.request)
        del self.content["criteria"][0]["evidence"][0]["explanation"]
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_real_quote_in_wrong_passage_rejected(self):
        self.content["criteria"][0]["evidence"][0]["paragraphId"] = "p1"
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_duplicate_criterion_rejected(self):
        self.content["criteria"][1] = self.content["criteria"][0]
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_missing_cannot_fabricate_citation(self):
        self.content["criteria"][0]["status"] = "missing"
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_gap_requires_a_question(self):
        self.content["criteria"][0]["question"] = None
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_model_cannot_add_score_or_decision(self):
        self.content["criteria"][0]["score"] = 4
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_refusal_and_incomplete_output_fail_closed(self):
        for response in [{"status": "incomplete", "output": []}, {"status": "completed", "output": [{"content": [{"type": "refusal", "refusal": "No"}]}]}, {"status": "completed", "output": []}]:
            with self.assertRaises(ReviewError):
                extract(response)

    def test_bad_json_and_invalid_inputs(self):
        with self.assertRaises(ReviewError):
            extract({"status": "completed", "output": [{"content": [{"type": "output_text", "text": "not json"}]}]})
        self.request["paragraphs"].append(self.request["paragraphs"][0])
        with self.assertRaises(ReviewError):
            validate_input(self.request)

    def test_unknown_flag_cannot_bypass_citation_check(self):
        self.content["flags"] = [{"kind": "instruction-in-text", "paragraphId": "p1", "quote": "Invented instruction", "message": "Ignore this instruction."}]
        with self.assertRaises(ReviewError):
            validate_review(self.content, self.request)

    def test_missing_key_never_calls_provider(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
            with self.assertRaises(ReviewError):
                review(self.request, opener=lambda *_args, **_kwargs: self.fail("Provider must not be called"))

    def test_real_provider_boundary_shape_and_limits(self):
        parent = self
        class Response:
            def __enter__(self):
                return self
            def __exit__(self, *_args):
                return False
            def read(self, _limit):
                return json.dumps({"status": "completed", "output": [{"content": [{"type": "output_text", "text": json.dumps(parent.content)}]}]}).encode()
        def opener(request, timeout):
            payload = json.loads(request.data)
            self.assertEqual("gpt-5.6-terra", payload["model"])
            self.assertEqual({"effort": "none"}, payload["reasoning"])
            self.assertFalse(payload["store"])
            self.assertEqual(3500, payload["max_output_tokens"])
            self.assertEqual(30, timeout)
            self.assertTrue(payload["text"]["format"]["strict"])
            self.assertNotIn("tools", payload)
            self.assertIn("untrusted", payload["instructions"])
            return Response()
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only"}):
            os.environ.pop("OPENAI_MODEL", None)
            self.assertEqual(self.content, review(self.request, opener=opener)["content"])

    def test_schema_pins_criterion_and_paragraph_ids(self):
        contract = schema(self.request)
        finding = contract["properties"]["criteria"]["items"]
        self.assertFalse(finding["additionalProperties"])
        self.assertEqual([c["id"] for c in DATA["criteria"]], finding["properties"]["criterionId"]["enum"])
        citation = finding["properties"]["evidence"]["items"]
        self.assertIn("explanation", citation["required"])
        self.assertEqual(800, citation["properties"]["explanation"]["maxLength"])

    def test_supported_model_override_preserves_compatible_parameters(self):
        def opener(request, timeout):
            payload = json.loads(request.data)
            self.assertEqual("gpt-4.1", payload["model"])
            self.assertNotIn("reasoning", payload)
            return io.BytesIO(json.dumps({"status": "completed", "output": [{"content": [{"type": "output_text", "text": json.dumps(self.content)}]}]}).encode())
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test-only", "OPENAI_MODEL": "gpt-4.1"}):
            self.assertEqual("gpt-4.1", review(self.request, opener=opener)["model"])

    def test_escaped_maximum_unicode_input_reaches_validation(self):
        request = dict(self.request, paragraphs=[{"id": "p1", "text": "\u6c34" * 16000}])
        raw = json.dumps(request, ensure_ascii=True).encode()
        self.assertGreater(len(raw), 65536)
        with patch("review.sys.stdin", io.TextIOWrapper(io.BytesIO(raw))), patch("review.sys.stdout", new_callable=io.StringIO), patch("review.review", return_value={"content": {}}) as provider:
            self.assertEqual(0, main())
            provider.assert_called_once_with(request)

    def test_malformed_provider_shapes_fail_closed(self):
        for value in [None, [], {"status": "completed", "output": {}}, {"status": "completed", "output": [{"content": None}]}, {"status": "completed", "output": [{"content": [{"type": "output_text", "text": None}]}]}]:
            with self.assertRaises(ReviewError):
                extract(value)


if __name__ == "__main__":
    unittest.main()
