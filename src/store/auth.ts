import { createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { userID as defaultUserID } from "../config/app";

export type PhotoIDMap = Map<string, Photo>;

interface PhotosState {
  userID: string;
}
const initialState: PhotosState = {
  userID: defaultUserID
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth(state, { payload }: PayloadAction<string>) {
      state.userID = payload;
    },
  },
  
});

export const { setAuth } = authSlice.actions;
export default authSlice.reducer;
