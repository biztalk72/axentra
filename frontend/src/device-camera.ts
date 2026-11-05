/** Browser-only camera sessions. Frames and device identifiers never enter API payloads. */
export type DeviceCameraState = {
  stream: MediaStream | null;
  devices: MediaDeviceInfo[];
  selected: string;
  status: "idle" | "requesting" | "playing" | "error";
  error: string;
};
type Session = {
  state: DeviceCameraState;
  listeners: Set<() => void>;
  viewers: number;
  generation: number;
  timer?: ReturnType<typeof setTimeout>;
};
const sessions = new Map<string, Session>();
const session = (id: string) => {
  if (!sessions.has(id))
    sessions.set(id, {
      state: {
        stream: null,
        devices: [],
        selected: "",
        status: "idle",
        error: "",
      },
      listeners: new Set(),
      viewers: 0,
      generation: 0,
    });
  return sessions.get(id)!;
};
function update(s: Session, patch: Partial<DeviceCameraState>) {
  s.state = { ...s.state, ...patch };
  s.listeners.forEach((fn) => fn());
}
export function cameraError(error: unknown) {
  const name = (error as { name?: string })?.name;
  return name === "NotAllowedError"
    ? "카메라 권한이 거부되었습니다. 브라우저의 카메라 권한을 확인한 뒤 다시 시도하세요."
    : name === "NotFoundError"
      ? "사용 가능한 카메라를 찾을 수 없습니다. 기기 연결을 확인하세요."
      : name === "NotReadableError"
        ? "다른 앱에서 카메라를 사용 중일 수 있습니다. 사용 중인 앱을 종료한 뒤 다시 시도하세요."
        : name === "OverconstrainedError"
          ? "선택한 카메라가 연결되어 있지 않습니다. 다른 카메라를 선택하세요."
          : "카메라를 시작할 수 없습니다. HTTPS 또는 localhost에서 연결 상태를 확인하세요.";
}
export const deviceCameraState = (id: string) => session(id).state;
export const subscribeDeviceCamera = (id: string, listener: () => void) => {
  const s = session(id);
  s.listeners.add(listener);
  return () => {
    s.listeners.delete(listener);
  };
};
export function retainDeviceCamera(id: string) {
  const s = session(id);
  clearTimeout(s.timer);
  s.viewers++;
  return () => {
    s.viewers--;
    s.timer = setTimeout(() => {
      if (!s.viewers) stopDeviceCamera(id);
    }, 250);
  };
}
export function stopDeviceCamera(id: string) {
  const s = session(id);
  s.generation++;
  s.state.stream?.getTracks().forEach((t) => t.stop());
  update(s, { stream: null, status: "idle", error: "" });
}
export async function refreshDeviceCameras(id: string) {
  const s = session(id);
  if (!navigator.mediaDevices?.enumerateDevices) return;
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
      (d) => d.kind === "videoinput",
    );
    update(s, { devices });
  } catch {
    /* Camera access errors are shown by the explicit start action. */
  }
}
export async function startDeviceCamera(id: string, selected?: string) {
  const s = session(id);
  if (s.state.status === "requesting") return;
  const generation = ++s.generation;
  s.state.stream?.getTracks().forEach((t) => t.stop());
  update(s, {
    status: "requesting",
    stream: null,
    error: "",
    selected: selected ?? s.state.selected,
  });
  try {
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw new Error("secure-context");
    const choice = selected ?? s.state.selected;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: choice
        ? {
            deviceId: { exact: choice },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    if (generation !== s.generation || !s.viewers) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => {
      if (s.state.stream === stream) {
        stopDeviceCamera(id);
        update(s, {
          status: "error",
          error:
            "카메라 연결이 종료되었습니다. 기기 연결을 확인하고 다시 시작하세요.",
        });
      }
    });
    update(s, {
      stream,
      status: "playing",
      selected: track.getSettings().deviceId || choice,
    });
    await refreshDeviceCameras(id);
  } catch (error) {
    if (generation === s.generation)
      update(s, { status: "error", error: cameraError(error) });
  }
}
if (typeof window !== "undefined")
  window.addEventListener("pagehide", () => {
    sessions.forEach((_, id) => stopDeviceCamera(id));
  });
