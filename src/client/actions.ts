import axios from "axios";
import { localApiBaseURL } from "../config/app";

export type ActionLog = {
  id: string;
  userID: string;
  type: string;
  title: string;
  description: string;
  responseTime: number;
  date: string;
  meta?: Record<string, unknown>;
};

export type StatsResponse = {
  photosProcessed: number;
  tagsAssigned: number;
  storageBytes: number;
  albums: number;
  actions: number;
};
 
export const checkOnline = async () => {
    return Promise.all([
      axios.get<{ status: boolean }>(`${localApiBaseURL}/status`),
      axios.get<{ status: boolean }>(`${localApiBaseURL}/ml/status`),
    ])
      .then(([localResp, mlResp]) => {
        return Boolean(localResp.data?.status && mlResp.data?.status);
      })
      .catch(() => false);
}

export const getActions = async (userID: string) => {
    return axios.get<{ actions: ActionLog[] }>(`${localApiBaseURL}/actions`, {
        params: { userID }
    }).then(resp => resp.data.actions);
}

export const getStats = async (userID: string) => {
  return axios
    .get<StatsResponse>(`${localApiBaseURL}/stats`, { params: { userID } })
    .then((resp) => resp.data);
};
