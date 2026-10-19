declare module "get-video-dimensions" {
  export default function getVideoDimensions(
    path: string
  ): Promise<{ width: number; height: number }>;
}
