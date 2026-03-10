import PhotosPage from "./components/pages/PhotosPage";
import AlbumsPage from "./components/pages/AlbumsPage";
import AlbumPhotosPage from "./components/pages/AlbumPhotosPage";
import { useEffect } from "react";

import { fetchData, useAppDispatch } from "./store";
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import FacesPage from "./components/pages/FacesPage";
import Layout from "./components/Layout";
import AIDataOverviewPage from "./components/pages/AIDataOverviewPage";
import AIActionsPage from "./components/pages/AIActionsPage";
import { userID } from "./config/app";
import ClassificationsPage from "./components/pages/ClassificationsPage";

const router = createBrowserRouter([
    {
      path: "/",
      element: <Layout />,
      children: [
        {
          path: "/ai/data",
          element: <AIDataOverviewPage />,
        }, {
          path: "/ai/actions",
          element: <AIActionsPage />,
        }, {
          index: true,
          element: <PhotosPage />//createAlbum={null} deleteSelectedPhotos={null} />
        }, {
          path: "faces",
          element: <FacesPage />
        }, {
          path: "albums",
          element: <AlbumsPage />
        }, {
          path: "albums/:id",
          element: <AlbumPhotosPage />
        }, {
          path: "classifications",
          element: <ClassificationsPage />
        }    
      ]
    },
  ]);
  

function App() {
    const dispatch = useAppDispatch();
    useEffect(() => {
        dispatch(fetchData(userID));
    }, []);

    return (
        <RouterProvider router={router} />
    );
}

export default App;
