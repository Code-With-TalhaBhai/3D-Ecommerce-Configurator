import { configureStore } from "@reduxjs/toolkit";

import cartReducer from "@/store/slices/cartSlice";
import viewerReducer from "@/store/slices/viewerSlice";

export const makeStore = () =>
  configureStore({
    reducer: {
      cart: cartReducer,
      viewer: viewerReducer,
    },
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
