import asyncio
import hashlib
import importlib.util
import ipaddress
import json
import pathlib
import sys
import unittest

from starlette.requests import Request

MAIN_PATH = pathlib.Path(__file__).with_name("main.py")
SPEC = importlib.util.spec_from_file_location("main", MAIN_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load main module from {MAIN_PATH}")
main = importlib.util.module_from_spec(SPEC)
sys.modules.setdefault("main", main)
SPEC.loader.exec_module(main)


def _request(headers=None, client_ip="10.0.0.10"):
    headers = headers or {}
    raw_headers = [(k.lower().encode("latin-1"), str(v).encode("latin-1")) for k, v in headers.items()]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/v1/chat/completions",
        "headers": raw_headers,
        "client": (client_ip, 12345),
        "scheme": "http",
        "http_version": "1.1",
    }
    return Request(scope)


class ContextExtractionTests(unittest.TestCase):
    def setUp(self):
        self._old_trusted = main.MULTIUSER_TRUSTED_NETWORKS
        self._old_user_headers = main.MULTIUSER_USER_HEADER_NAMES
        self._old_tenant_headers = main.MULTIUSER_TENANT_HEADER_NAMES
        self._old_allow_untrusted_headers = main.ALLOW_UNTRUSTED_USER_HEADERS
        self._old_allow_client_user = main.ALLOW_CLIENT_PROVIDED_USER_ID
        self._old_allow_client_workspace = main.ALLOW_CLIENT_PROVIDED_WORKSPACE
        self._old_allowed_actions = set(main.LOCALAGI_ALLOWED_ACTIONS)
        self._old_blocked_actions = set(main.LOCALAGI_BLOCKED_ACTIONS)
        self._old_localagi_tool_mode = main.LOCALAGI_TOOL_MODE
        self._old_trusted_localagi_tool_mode = main.TRUSTED_LOCALAGI_TOOL_MODE
        self._old_nextcloud_tool_mode = main.NEXTCLOUD_TOOL_MODE
        self._old_nextcloud_trusted = main.NEXTCLOUD_TRUSTED_NETWORKS
        self._old_gateway_api_key = main.GATEWAY_API_KEY

    def tearDown(self):
        main.MULTIUSER_TRUSTED_NETWORKS = self._old_trusted
        main.MULTIUSER_USER_HEADER_NAMES = self._old_user_headers
        main.MULTIUSER_TENANT_HEADER_NAMES = self._old_tenant_headers
        main.ALLOW_UNTRUSTED_USER_HEADERS = self._old_allow_untrusted_headers
        main.ALLOW_CLIENT_PROVIDED_USER_ID = self._old_allow_client_user
        main.ALLOW_CLIENT_PROVIDED_WORKSPACE = self._old_allow_client_workspace
        main.LOCALAGI_ALLOWED_ACTIONS = self._old_allowed_actions
        main.LOCALAGI_BLOCKED_ACTIONS = self._old_blocked_actions
        main.LOCALAGI_TOOL_MODE = self._old_localagi_tool_mode
        main.TRUSTED_LOCALAGI_TOOL_MODE = self._old_trusted_localagi_tool_mode
        main.NEXTCLOUD_TOOL_MODE = self._old_nextcloud_tool_mode
        main.NEXTCLOUD_TRUSTED_NETWORKS = self._old_nextcloud_trusted
        main.GATEWAY_API_KEY = self._old_gateway_api_key

    def test_trusted_header_identity_and_workspace(self):
        main.MULTIUSER_TRUSTED_NETWORKS = [ipaddress.ip_network("10.0.0.0/8")]
        main.MULTIUSER_USER_HEADER_NAMES = ["x-user-id"]
        main.MULTIUSER_TENANT_HEADER_NAMES = ["x-console-workspace-id"]
        req = _request({"x-user-id": "alice", "x-console-workspace-id": "wk-alpha"})
        ctx = main._extract_request_context(req, {"messages": [{"role": "user", "content": "hi"}]})
        self.assertEqual(ctx["user_id"], "alice")
        self.assertEqual(ctx["workspace_id"], "wk-alpha")
        self.assertEqual(ctx["scope_key"], "alice::wk-alpha")

    def test_console_context_metadata_used(self):
        main.MULTIUSER_TRUSTED_NETWORKS = []
        main.ALLOW_CLIENT_PROVIDED_USER_ID = True
        main.ALLOW_CLIENT_PROVIDED_WORKSPACE = True
        req = _request()
        payload = {
            "user_id": "console-user-1",
            "metadata": {
                "console_context": {
                    "workspaceId": "team-123",
                    "workspaceSlug": "alpha-team",
                    "workspaceRole": "Owner",
                }
            },
        }
        ctx = main._extract_request_context(req, payload)
        self.assertEqual(ctx["user_id"], "console-user-1")
        self.assertEqual(ctx["workspace_id"], "team-123")
        self.assertEqual(ctx["workspace_role"], "Owner")
        self.assertEqual(ctx["scope_key"], "console-user-1::team-123")

    def test_untrusted_identity_inputs_ignored_by_default(self):
        main.MULTIUSER_TRUSTED_NETWORKS = []
        main.ALLOW_UNTRUSTED_USER_HEADERS = False
        main.ALLOW_CLIENT_PROVIDED_USER_ID = False
        req = _request({"x-user-id": "alice", "authorization": "Bearer test-key-123"})
        payload = {"user_id": "bob", "metadata": {"user_id": "charlie"}}
        ctx = main._extract_request_context(req, payload)
        expected = "auth-" + hashlib.sha256("Bearer test-key-123".encode("utf-8")).hexdigest()[:12]
        self.assertEqual(ctx["user_id"], expected)

    def test_scope_changes_collection(self):
        c1 = main._collection_for_scope("localai-memory", "alice::ws-a")
        c2 = main._collection_for_scope("localai-memory", "alice::ws-b")
        c3 = main._collection_for_scope("localai-memory", "bob::ws-a")
        self.assertNotEqual(c1, c2)
        self.assertNotEqual(c1, c3)

    def test_prepare_payload_strips_gateway_only_fields(self):
        payload = {
            "model": "qwen3-1.7b",
            "user_id": "console-123",
            "metadata": {"console_context": {"workspaceId": "w1"}},
            "messages": [{"role": "user", "content": "hello"}],
        }
        out = main._prepare_payload_for_localai(payload, "console-123")
        self.assertNotIn("user_id", out)
        self.assertNotIn("metadata", out)
        self.assertEqual(out.get("user"), "console-123")

    def test_extract_models_list_accepts_openai_shape(self):
        payload = {"object": "list", "data": [{"id": "a"}, {"id": "b"}]}
        out = main._extract_models_list(payload)
        self.assertEqual([item["id"] for item in out], ["a", "b"])

    def test_extract_models_list_accepts_models_shape(self):
        payload = {"models": [{"id": "x"}]}
        out = main._extract_models_list(payload)
        self.assertEqual([item["id"] for item in out], ["x"])

    def test_localagi_action_policy_allow_and_block(self):
        main.LOCALAGI_ALLOWED_ACTIONS = {"search", "browse"}
        main.LOCALAGI_BLOCKED_ACTIONS = {"shell-command"}

        ok, reason = main._is_localagi_action_allowed("search")
        self.assertTrue(ok)
        self.assertEqual(reason, "")

        ok, reason = main._is_localagi_action_allowed("shell-command")
        self.assertFalse(ok)
        self.assertIn("blocked", reason)

        ok, reason = main._is_localagi_action_allowed("scraper")
        self.assertFalse(ok)
        self.assertIn("allowlist", reason)

    def test_effective_tool_mode_uses_trusted_multiuser_override(self):
        main.LOCALAGI_TOOL_MODE = "off"
        main.TRUSTED_LOCALAGI_TOOL_MODE = "auto"
        main.MULTIUSER_TRUSTED_NETWORKS = [ipaddress.ip_network("10.0.0.0/8")]
        req = _request(client_ip="10.1.2.3")
        self.assertEqual(main._effective_localagi_tool_mode(req), "auto")

    def test_effective_tool_mode_uses_nextcloud_override(self):
        main.LOCALAGI_TOOL_MODE = "off"
        main.NEXTCLOUD_TOOL_MODE = "force"
        main.NEXTCLOUD_TRUSTED_NETWORKS = [ipaddress.ip_network("10.0.0.0/8")]
        req = _request(client_ip="10.1.2.3")
        self.assertEqual(main._effective_localagi_tool_mode(req), "force")

    def test_gateway_key_fails_closed_when_missing(self):
        main.GATEWAY_API_KEY = ""
        with self.assertRaises(main.HTTPException) as ctx:
            main._require_gateway_key(_request())
        self.assertEqual(ctx.exception.status_code, 503)

    def test_gateway_key_rejects_wrong_token(self):
        main.GATEWAY_API_KEY = "gateway-secret"
        with self.assertRaises(main.HTTPException) as ctx:
            main._require_gateway_key(_request({"authorization": "Bearer wrong"}))
        self.assertEqual(ctx.exception.status_code, 401)
        main._require_gateway_key(_request({"authorization": "Bearer gateway-secret"}))


class MemorySearchTests(unittest.IsolatedAsyncioTestCase):
    class _StubResponse:
        def __init__(self, status_code, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload if payload is not None else {}
            self.text = text

        def json(self):
            return self._payload

    class _StubClient:
        def __init__(self, responses):
            self._responses = list(responses)
            self.calls = []

        async def post(self, url, json=None, timeout=None):
            self.calls.append({"url": url, "json": json, "timeout": timeout})
            if not self._responses:
                raise AssertionError("unexpected extra POST call")
            return self._responses.pop(0)

    async def asyncSetUp(self):
        self._old_http_client = main.http_client
        self._old_known_collections = set(main.known_collections)
        self._old_memory_top_k = main.MEMORY_TOP_K

    async def asyncTearDown(self):
        main.http_client = self._old_http_client
        main.known_collections = self._old_known_collections
        main.MEMORY_TOP_K = self._old_memory_top_k

    async def test_search_memory_retries_with_server_limit(self):
        collection = "localai-memory-test"
        main.known_collections = {collection}
        main.MEMORY_TOP_K = 5
        stub = self._StubClient(
            [
                self._StubResponse(
                    500,
                    payload={"error": {"details": "nResults must be <= 2"}},
                    text='{"error":{"details":"nResults must be <= 2"}}',
                ),
                self._StubResponse(
                    200,
                    payload={"data": {"results": [{"content": "first"}, {"text": "second"}]}},
                ),
            ]
        )
        main.http_client = stub

        result = await main._search_memory(collection, "hello")

        self.assertEqual(result, ["first", "second"])
        self.assertEqual([call["json"]["max_results"] for call in stub.calls], [5, 2])


    async def test_search_memory_jumps_to_one_when_server_limit_has_no_count(self):
        collection = "localai-memory-test"
        main.known_collections = {collection}
        main.MEMORY_TOP_K = 5
        stub = self._StubClient(
            [
                self._StubResponse(
                    500,
                    payload={"error": {"details": "nResults must be <= the number of documents in the collection"}},
                    text='{"error":{"details":"nResults must be <= the number of documents in the collection"}}',
                ),
                self._StubResponse(
                    200,
                    payload={"data": {"results": [{"content": "seed memory"}]}},
                ),
            ]
        )
        main.http_client = stub

        result = await main._search_memory(collection, "hello")

        self.assertEqual(result, ["seed memory"])
        self.assertEqual([call["json"]["max_results"] for call in stub.calls], [5, 1])


class ToolExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self._old_localai_post = main._localai_post
        self._old_run_localagi_action = main._run_localagi_action
        self._old_max_tool_rounds = main.MAX_TOOL_ROUNDS
        main.MAX_TOOL_ROUNDS = 2

    async def asyncTearDown(self):
        main._localai_post = self._old_localai_post
        main._run_localagi_action = self._old_run_localagi_action
        main.MAX_TOOL_ROUNDS = self._old_max_tool_rounds

    async def test_localagi_failures_are_returned_as_tool_errors(self):
        responses = [
            {
                "choices": [
                    {
                        "message": {
                            "content": "",
                            "tool_calls": [
                                {
                                    "id": "call_1",
                                    "type": "function",
                                    "function": {
                                        "name": main.LOCALAGI_TOOL_NAME,
                                        "arguments": json.dumps({"action": "search", "params": {"q": "hello"}}),
                                    },
                                }
                            ],
                        }
                    }
                ]
            },
            {"choices": [{"message": {"content": "done"}}]},
        ]

        async def stub_localai_post(path, payload, base_url=None):
            return responses.pop(0)

        async def stub_run_localagi_action(action, config, params):
            raise RuntimeError("tool backend unavailable")

        main._localai_post = stub_localai_post
        main._run_localagi_action = stub_run_localagi_action

        result, tool_outputs = await main._run_localai_with_tools({"messages": [{"role": "user", "content": "hello"}]})

        self.assertEqual(result["choices"][0]["message"]["content"], "done")
        self.assertEqual(tool_outputs[0]["result"]["error"], "tool backend unavailable")


class HealthTests(unittest.IsolatedAsyncioTestCase):
    class _StubResponse:
        def __init__(self, status_code, text=""):
            self.status_code = status_code
            self.text = text
            self.content = text.encode("utf-8")

        def json(self):
            return {}

    class _StubClient:
        def __init__(self, responses):
            self._responses = responses

        async def get(self, url, headers=None, timeout=None):
            if url not in self._responses:
                raise AssertionError(f"unexpected URL: {url}")
            return self._responses[url]

    async def asyncSetUp(self):
        self._old_http_client = main.http_client
        self._old_health_cache = dict(main.health_cache)
        self._old_health_cache_lock = main.health_cache_lock

    async def asyncTearDown(self):
        main.http_client = self._old_http_client
        main.health_cache = self._old_health_cache
        main.health_cache_lock = self._old_health_cache_lock

    async def test_healthz_returns_503_when_any_dependency_fails(self):
        responses = {
            url: self._StubResponse(200)
            for url, _headers in main._dependency_targets().values()
        }
        first_url = next(iter(responses))
        responses[first_url] = self._StubResponse(500, "boom")
        main.http_client = self._StubClient(responses)
        main.health_cache = {"expires_at": 0.0, "payload": None}
        main.health_cache_lock = asyncio.Lock()

        response = await main.healthz()

        self.assertEqual(response.status_code, 503)
        self.assertIn(b'"status":"degraded"', response.body)


if __name__ == "__main__":
    unittest.main()
