import { predictPhotoTags } from "./process";
import { Id, toast } from "react-toastify";
import { Photo, PhotosMap } from "../models/Photo";
import axios from "axios";
import { localApiBaseURL } from "../config/app";

export type FileInfo = {
  name: string;
  base64: string;
  type: string;
  width: number;
  height: number;
}

type StoredPhoto = Photo & { id: string };
type UploadPhotoPayload = Omit<FileInfo, "base64"> & { base64: string; tags: string[]; description?: string };

export const getPhotos = async (userID: string) => {
  const photos: PhotosMap = {};
  const { data } = await axios.get<StoredPhoto[]>(`${localApiBaseURL}/photos`, {
    params: { userID },
  });
  data.forEach(({ id, ...photo }) => {
    photos[id] = photo;
  });
  return photos;
}

const uploadPhotos = async (
  files: FileInfo[],
  photosTags: string[][],
  descriptions: (string | undefined)[],
  userID: string
) => {
  const newPhotosMap: PhotosMap = {}; // Store new, uploaded photos
  const loadingToast = toast.loading(`Uploading ${files.length} photo` + (files.length === 1 ? "" : "s"), { progress: 0 });

  try {
    const payload = files.map((file, idx) => {
      return {
        ...file,
        tags: photosTags[idx],
        description: descriptions[idx],
      } as UploadPhotoPayload;
    });
    const { data } = await axios.post<StoredPhoto[]>(`${localApiBaseURL}/photos`, {
      userID,
      photos: payload,
    });
    data.forEach(({ id, ...photo }, idx) => {
      newPhotosMap[id] = photo;
      toast.update(loadingToast, { progress: (idx + 1) / data.length });
    });
  } catch (err) {
    toast.update(loadingToast, { type: 'error', render: "Upload error " + err });
    return newPhotosMap;
  }
  toast.update(loadingToast, { type: 'success', render: `Uploaded ${files.length} photo` + (files.length === 1 ? "" : "s"), isLoading: false });
  return newPhotosMap;
}

export interface HandleUploadReturnType {
  newPhotos: PhotosMap;
  facePhotoIDs: string[];
  facePhotosBase64: string[];
}

/**
 * @param photos HTML File objects for upload images
 * @param userID Client's user id
 * @returns new Photo objects, array of photo IDs with faces, base64 of photos with faces
 */
export const handleUpload = async (photos: FileInfo[], userID: string) => {
  // Make tag predictions for each photo
  const base64Photos = photos.map((f) => f.base64);
  // TODO: return face bounding boxes
  const photoResults = await predictPhotoTags(base64Photos).catch(() => {
    toast.warn("ML backend unavailable; uploaded photos without AI tags.");
    return photos.map(() => ({ tags: [], has_face: false }));
  });

  // Array of tags for all photos
  const tags = photoResults.map(result => result.tags);
  const descriptions = photoResults.map((result) => result.description);

  // Upload to firebase
  const newPhotos = await uploadPhotos(photos, tags, descriptions, userID);
  
  // Filter ids of photos which contain faces
  const facePhotoIDs = Object.keys(newPhotos).filter((_, idx) => photoResults[idx].has_face);
  const facePhotosBase64 = photos
    .filter((_, idx) => photoResults[idx].has_face)
    .map(file => file.base64);
  return { newPhotos, facePhotoIDs, facePhotosBase64 } as HandleUploadReturnType;
};

export const deletePhoto = async (id: string, userID: string) => {
  await axios.delete(`${localApiBaseURL}/photos/${id}`, {
    params: { userID },
  });
}

export const addCustomTag = async (id: string, tag: string, _userID: string) => {
  const { data } = await axios.patch<{ id: string; tags: string[] }>(`${localApiBaseURL}/photos/${id}/tags`, {
    tag,
    action: "add",
  });
  return data;
};

export const removeCustomTag = async (id: string, tag: string, _userID: string) => {
  const { data } = await axios.patch<{ id: string; tags: string[] }>(`${localApiBaseURL}/photos/${id}/tags`, {
    tag,
    action: "remove",
  });
  return data;
};
