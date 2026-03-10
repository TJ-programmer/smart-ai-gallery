import { Album } from "../models/Album";
import axios from "axios";
import { localApiBaseURL } from "../config/app";


export const getAlbums = async (userID: string) => {
  const { data } = await axios.get<Album[]>(`${localApiBaseURL}/albums`, {
    params: { userID },
  });
  return data;
}

export const createAlbum = async (photoIDs: string[], name: string, userID: string) => {
  const { data } = await axios.post<Album>(`${localApiBaseURL}/albums`, {
    name,
    photoIDs,
    userID,
  });
  return data;
}

export const deleteAlbum = async (albumID: string, userID: string) => {
  await axios.delete(`${localApiBaseURL}/albums/${albumID}`, {
    params: { userID },
  });
}

export const addPhotosToAlbum = async (album: Album, photoIDs: string[], userID: string) => {
  // Update album doc
  // Create reference to album for each photo
  // Handle photo already in album
  return {} as Album;
}

export const removePhotosFromAlbum = async (album: Album, photoIDs: string[], userID: string) => {
  // Update album photoIDs
  // Remvoe reference to album for each photo
  // No need to handle photo not in album
  return {} as Album;
}
