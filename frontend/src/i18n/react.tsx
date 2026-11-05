import { useSyncExternalStore } from "react";
import { Globe2 } from "lucide-react";
import { getLocale, setLocale, subscribeLocale } from "./locale";
export const useLocale = () => useSyncExternalStore(subscribeLocale, getLocale);
export function LanguageSelector() {
  const locale = useLocale();
  return (
    <label className="language-selector">
      <Globe2 size={15} />
      <select
        aria-label="Language / 언어"
        value={locale}
        onChange={(e) => setLocale(e.target.value as "ko" | "en")}
      >
        <option value="ko">한국어</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
