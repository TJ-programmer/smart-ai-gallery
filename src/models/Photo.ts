export type Photo = {
  src: string;
  name: string;
  tags: string[];
  description?: string;
  createdAt: string;
  width: number;
  height: number;
}

export type PhotosMap = {[key: string]: Photo};
