/* Node ESM resolve hook: map the bare specifier 'three' to the local stub. */
export async function resolve(spec, context, next) {
  if (spec === 'three') {
    return {
      url: new URL('./three-stub.mjs', import.meta.url).href,
      shortCircuit: true,
      format: 'module',
    };
  }
  return next(spec, context);
}
