declare module "web-worker:*" {
  const value: new () => Worker;
  export default value;
}
