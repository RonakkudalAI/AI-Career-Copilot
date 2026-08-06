import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";

type DynamicOptions = { loading?: ComponentType; ssr?: boolean };

export function dynamic<TProps extends object = Record<string, unknown>>(
  loader: () => Promise<ComponentType<TProps> | { default: ComponentType<TProps> }>,
  options: DynamicOptions = {},
) {
  const LazyComponent: LazyExoticComponent<ComponentType<TProps>> = lazy(async () => {
    const loaded = await loader();
    return typeof loaded === "object" && loaded !== null && "default" in loaded
      ? loaded
      : { default: loaded };
  });
  return function DynamicComponent(props: TProps) {
    const Loading = options.loading;
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
