import { ui } from "./i18n/locale";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Camera, RefreshCw, Square } from "lucide-react";
import {
  deviceCameraState,
  subscribeDeviceCamera,
  retainDeviceCamera,
  startDeviceCamera,
  stopDeviceCamera,
  refreshDeviceCameras,
} from "./device-camera";
export function DeviceCameraView({
  id,
  interactive = true,
}: {
  id: string;
  interactive?: boolean;
}) {
  const state = useSyncExternalStore(
    (fn) => subscribeDeviceCamera(id, fn),
    () => deviceCameraState(id),
  );
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => retainDeviceCamera(id), [id]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = state.stream;
    if (state.stream) void element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [state.stream]);
  useEffect(() => {
    const change = () => {
      if (deviceCameraState(id).status === "playing")
        void refreshDeviceCameras(id);
    };
    navigator.mediaDevices?.addEventListener("devicechange", change);
    return () =>
      navigator.mediaDevices?.removeEventListener("devicechange", change);
  }, [id]);
  return (
    <div className="device-camera-view">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={ui("기기 카메라 실시간 영상")}
      />
      {state.status !== "playing" && (
        <div className="device-camera-prompt">
          <Camera size={28} />
          <b>{ui("기기 카메라")}</b>
          <p>
            {ui(
              state.error ||
                "Mac 내장 카메라, iPhone 연속성 카메라 또는 연결된 웹캠을 사용할 수 있습니다.",
            )}
          </p>
          {interactive ? (
            <button
              className="btn"
              disabled={state.status === "requesting"}
              onClick={() =>
                void startDeviceCamera(
                  id,
                  state.status === "error" ? "" : undefined,
                )
              }
            >
              <Camera size={14} />
              {ui(
                state.status === "requesting"
                  ? "카메라 권한 확인 중…"
                  : "카메라 켜기",
              )}
            </button>
          ) : (
            <small>
              {ui(
                "실행 화면에서 카메라를 켜세요. 미리보기는 카메라 권한을 요청하지 않습니다.",
              )}
            </small>
          )}
          <small>
            {ui(
              "영상은 현재 브라우저에서만 표시되며 서버로 전송하거나 녹화하지 않습니다.",
            )}
          </small>
        </div>
      )}
      {state.status === "playing" && interactive && (
        <div className="device-camera-controls">
          <select
            aria-label={ui("기기 카메라 선택")}
            value={state.selected}
            onChange={(e) => void startDeviceCamera(id, e.target.value)}
          >
            {!state.devices.length && (
              <option value={state.selected}>{ui("현재 카메라")}</option>
            )}
            {state.devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {ui(device.label || `카메라 ${index + 1}`)}
              </option>
            ))}
          </select>
          <button
            aria-label={ui("카메라 목록 새로고침")}
            onClick={() => void refreshDeviceCameras(id)}
          >
            <RefreshCw size={14} />
          </button>
          <button
            aria-label={ui("기기 카메라 끄기")}
            onClick={() => stopDeviceCamera(id)}
          >
            <Square size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
