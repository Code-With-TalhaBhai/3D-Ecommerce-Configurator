/**
 * Best-effort "is this a phone/tablet, not a desktop with a webcam" check.
 * Virtual try-on needs a rear camera worn on the body to be meaningful —
 * `navigator.mediaDevices.getUserMedia` support alone isn't a good enough
 * signal since most desktop/laptop browsers with a webcam pass it too.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const uaDataMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile;
  if (typeof uaDataMobile === "boolean") return uaDataMobile;

  return /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}
