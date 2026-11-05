import test from "node:test";
import assert from "node:assert/strict";
import {
  setLocale,
  getLocale,
  ui,
  text,
  intlLocale,
} from "../src/i18n/locale.ts";
import {
  retainDeviceCamera,
  startDeviceCamera,
  stopDeviceCamera,
  deviceCameraState,
  cameraError,
} from "../src/device-camera.ts";

test("language switching translates UI, interpolated evidence and dates without changing records", () => {
  const data = { id: "LOT-abc", name: "면 반제품", quantity: "0.125" };
  setLocale("en");
  assert.equal(getLocale(), "en");
  assert.equal(intlLocale(), "en-US");
  assert.equal(text("제조 운영 현황"), "Manufacturing operations overview");
  assert.equal(
    text("BOM 5종 중 기준 배치의 가용 자재가 부족한 BOM은 1종입니다."),
    "BOM assessment: 5 definitions; 1 with insufficient materials for the reference batch.",
  );
  assert.equal(text("A라인 생산 전광판"), "Line A Production board");
  assert.equal(ui(data), data);
  assert.equal(data.name, "면 반제품");
  assert.equal(
    text("Customer-specific product 42"),
    "Customer-specific product 42",
  );
  assert.deepEqual(ui(["생산 관리", 42]), ["Production management", 42]);
  setLocale("ko");
  assert.equal(ui("생산 관리"), "생산 관리");
  assert.equal(data.quantity, "0.125");
});

function mediaMock(getUserMedia) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: async () => [
          { kind: "videoinput", deviceId: "mac-camera", label: "Mac camera" },
        ],
      },
    },
  });
  globalThis.isSecureContext = true;
}
function streamFixture() {
  const track = new EventTarget();
  track.stops = 0;
  track.stop = () => track.stops++;
  track.getSettings = () => ({ deviceId: "mac-camera" });
  return {
    track,
    stream: { getTracks: () => [track], getVideoTracks: () => [track] },
  };
}
test("camera access is explicit, shared through view transitions and stopped after the last view closes", async () => {
  let calls = 0;
  const { track, stream } = streamFixture();
  mediaMock(async (constraints) => {
    calls++;
    assert.equal(constraints.audio, false);
    return stream;
  });
  const release = retainDeviceCamera("life");
  assert.equal(calls, 0);
  await startDeviceCamera("life");
  assert.equal(calls, 1);
  assert.equal(deviceCameraState("life").status, "playing");
  release();
  const releaseExpanded = retainDeviceCamera("life");
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(track.stops, 0);
  releaseExpanded();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(track.stops, 1);
  assert.equal(deviceCameraState("life").stream, null);
});
test("late camera permission completion cannot leak a stream after navigating away", async () => {
  const { track, stream } = streamFixture();
  let resolve;
  mediaMock(() => new Promise((r) => (resolve = r)));
  const release = retainDeviceCamera("late");
  const request = startDeviceCamera("late");
  release();
  resolve(stream);
  await request;
  assert.equal(track.stops, 1);
  stopDeviceCamera("late");
});
test("denied permissions and disconnected camera tracks remain actionable and never report a live feed", async () => {
  mediaMock(async () => {
    throw new DOMException("denied", "NotAllowedError");
  });
  const release = retainDeviceCamera("denied");
  await startDeviceCamera("denied");
  assert.equal(deviceCameraState("denied").status, "error");
  assert.match(deviceCameraState("denied").error, /권한/);
  const { track, stream } = streamFixture();
  mediaMock(async () => stream);
  await startDeviceCamera("denied", "mac-camera");
  track.dispatchEvent(new Event("ended"));
  assert.equal(deviceCameraState("denied").status, "error");
  assert.equal(deviceCameraState("denied").stream, null);
  assert.match(cameraError({ name: "NotFoundError" }), /찾을/);
  release();
  stopDeviceCamera("denied");
});
