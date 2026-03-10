import { DeleteForeverRounded } from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom'
import ActionButton from '../misc/ActionButton';
import ActionButtonStack from '../misc/ActionButtonStack';
import PhotoCollage from '../photos/PhotoCollage'
import { useAppDispatch, useAppSelector } from '../../store';
import { deleteAlbum } from '../../store/albums';
import { selectAllAlbums } from '../../store/albums';
import { selectAllPhotos } from '../../store/photos';
import { userID } from '../../config/app';

const AlbumPhotosPage = () => {
  // Get album id from query string parameters
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const albums = useAppSelector(selectAllAlbums);
  const allPhotos = useAppSelector(selectAllPhotos);
  const album = albums.find((item) => item.id === id);

  const albumPhotos = () => {
    if (!album) return {};
    const result = {};
    album.photoIDs.forEach((photoID) => {
      if (allPhotos[photoID]) {
        result[photoID] = allPhotos[photoID];
      }
    });
    return result;
  };

  const DeleteAlbumButton = () => (
    <ActionButton
      label='Delete album'
      icon={<DeleteForeverRounded />}
      onClick={() => {
        if (!id) return;
        dispatch(deleteAlbum({ albumID: id, userID }));
        navigate('/albums');
      }}
    />
  )

  return (
    <>
      <PhotoCollage photos={albumPhotos()} isSelectMode={false} />
      <ActionButtonStack>
        <DeleteAlbumButton />
      </ActionButtonStack>
    </>
  )

}

export default AlbumPhotosPage;
