import {
  useLocation as useReactLocation,
  useNavigate,
  useParams as useReactRouterParams,
} from "react-router-dom";
import { useMemo } from "react";

/** Re-export react-router location for Next-compat call sites. */
export { useReactLocation as useLocation };

export function useRouter() {
  const navigate = useNavigate();
  return useMemo(
    () => ({
      push: (to: string) => navigate(to),
      replace: (to: string) => navigate(to, { replace: true }),
      back: () => navigate(-1),
      refresh: () => window.location.reload(),
    }),
    [navigate],
  );
}

export function usePathname() {
  return useReactLocation().pathname;
}

export function useSearchParams() {
  return new URLSearchParams(useReactLocation().search);
}

export function useParams<
  T extends Record<string, string | undefined> = Record<string, string | undefined>,
>() {
  return useReactRouterParams() as T;
}
