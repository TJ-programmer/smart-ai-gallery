import { ImageList } from '@mui/material';
import AlbumTile from '../albums/AlbumTile';
import { useAppSelector } from '../../store';
import { selectAllAlbums } from '../../store/albums';
import { selectAllPhotos } from '../../store/photos';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const AlbumsPage = () => {
  const albums = useAppSelector(selectAllAlbums);
  const photos = useAppSelector(selectAllPhotos);
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const filteredAlbums = useMemo(() => {
    if (!q) return albums;
    return albums.filter((album) => {
      const nameMatch = album.name.toLowerCase().includes(q);
      const tagMatch = album.photoIDs.some((photoID) => {
        const photo = photos[photoID];
        if (!photo) return false;
        return `${photo.name} ${(photo.tags || []).join(" ")} ${photo.description || ""}`
          .toLowerCase()
          .includes(q);
      });
      return nameMatch || tagMatch;
    });
  }, [albums, photos, q]);

  const getAlbumPreviewPhoto = (albumId) => {
    const album = albums.find(({ id }) => id === albumId);
    if (!album || album.photoIDs.length === 0) {
      return 'https://via.placeholder.com/380';
    }
    const firstPhoto = photos[album.photoIDs[0]];
    return (firstPhoto && firstPhoto.src) || 'https://via.placeholder.com/380';
  };

  return (
    <ImageList sx={{ m: 0 }} variant="standard" cols={3} gap={10} rowHeight="280px">
      {filteredAlbums.map((album) => (
        <AlbumTile key={album.id} previewPhotoUrl={getAlbumPreviewPhoto(album.id)} {...album} />
      ))}
    </ImageList>
  );
};

export default AlbumsPage;
