import React, { useEffect, useState } from "react";
import RPGallery, { GalleryI, PhotoProps, RenderImageProps } from 'react-photo-gallery';
import "./PhotoCollage.css";

import PhotoTile from "./PhotoTile";
import PhotoView from "./PhotoView";

import { Button, Card, Col, Descriptions, Image, Input, Modal, Result, Row, Space, Statistic, Tag, Typography } from "antd";
import { BulbOutlined, ColumnHeightOutlined, ColumnWidthOutlined, DownloadOutlined, InfoCircleFilled, InfoCircleOutlined, LinkOutlined, RotateLeftOutlined, RotateRightOutlined, SwapOutlined, ZoomInOutlined, ZoomOutOutlined } from "@ant-design/icons";

import { useAppDispatch, useAppSelector } from "../../store";
import { addPhotoTag, removePhotoTag, selectPhoto, selectSelectedPhotos } from "../../store/photos";

import { Photo, PhotosMap } from "../../models/Photo";

interface PhotoListProps {
  photos: PhotosMap;
  isSelectMode: boolean;
  onUploadClick?: () => void;
}

const Gallery = RPGallery as unknown as GalleryI<Photo & { selected: boolean; id: string }>
type GalleryPhoto = {
  index: number;
  next: PhotoProps<Photo & {
    id: string;
    selected: boolean;
  }> | null;
  photo: PhotoProps<Photo & {
    id: string;
    selected: boolean;
  }>;
  previous: PhotoProps<Photo & {
    id: string;
    selected: boolean;
  }> | null;
}


const PhotoCollage: React.FC<PhotoListProps> = ({ photos, isSelectMode, onUploadClick }) => {
  const selectedPhotoIDs = useAppSelector(selectSelectedPhotos);
  const dispatch = useAppDispatch();

  // Use an array of photo IDs to navigate gallery by 
  // increasing/decreasing the current photo index by 1
  const photoIDs = Object.keys(photos);
  const [modalIdx, setModalView] = useState(-1);
  // const open = photoIndex !== -1; // Whether the photo view modal is open

  // Make object writeable using spread operator
  const photoArray = Object.entries(photos).map(([id, photo]) => (
    { 
      id,
      selected: selectedPhotoIDs.includes(id),
      ...photo
    }  
  ));

  const [previewIdx, setPreviewIdx] = useState(-1);
  const [customTag, setCustomTag] = useState("");
  
  
  // If not in select mode, open photo modal by setting photo index to a non-negative number
  const onClickPhoto = (index: number) => {
    if (isSelectMode) {
      dispatch(selectPhoto(photoIDs[index]));
    } else {
      // toggle preview
      setPreviewIdx(index);
    }
  }

  const onDownload = (photo: Photo) => {
    fetch(photo.src)
      .then((response) => response.blob())
      .then((blob) => {
        const url = URL.createObjectURL(new Blob([blob]));
        const link = document.createElement('a');
        link.href = url;
        link.download = photo.name + '.png';
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(url);
        link.remove();
      });
  };


  const renderImage = (props: RenderImageProps<Photo & { selected: boolean; id: string; }>) => (
    <PhotoTile {...props} handleInfoClick={() => setModalView(props.index)} />
  );


  const previewPhoto = photoArray[previewIdx];
  const modalPhoto = photoArray[modalIdx];
  
  return (
    <>
      <Image.PreviewGroup preview={{
        visible: previewIdx >= 0,
        current: previewIdx,
        onVisibleChange: () => {
          setPreviewIdx(-1);
        },
        onChange: (current) => {
          setPreviewIdx(current);
        },
        toolbarRender: (
          _,
          {
            transform: { scale },
            actions: { onFlipY, onFlipX, onRotateLeft, onRotateRight, onZoomOut, onZoomIn },
          },
        ) => (
          <Space size={12} className="toolbar-wrapper">
            <DownloadOutlined onClick={() => onDownload(previewPhoto)} />
            <SwapOutlined rotate={90} onClick={onFlipY} />
            <SwapOutlined onClick={onFlipX} />
            <RotateLeftOutlined onClick={onRotateLeft} />
            <RotateRightOutlined onClick={onRotateRight} />
            <ZoomOutOutlined disabled={scale === 1} onClick={onZoomOut} />
            <ZoomInOutlined disabled={scale === 50} onClick={onZoomIn} />
          </Space>)
      }}>
        {photoArray.map((photo, i) => {
          return (
            <Image
              key={i}
              style={{ display: 'none' }}
              src={photo.src}
              preview={{
                visible: (previewIdx == i),
                src: photo.src
              }}
            />
          )
        })}
      </Image.PreviewGroup>

      {photoArray.length > 0 ? (
        <div style={{ marginTop: -17 }}>
          <Gallery
            photos={photoArray}
            renderImage={renderImage}
            margin={8}
            targetRowHeight={200}
            onClick={(_: any, photo: GalleryPhoto) => onClickPhoto(photo.index)}
          /> 
        </div>
      ) : <Result
          title="No Photos"
          subTitle="Upload a photo to your gallery."
          icon={<BulbOutlined />}
          extra={[
            <Button type="primary" key="upload" onClick={onUploadClick}>
              Upload Photos
            </Button>,
          ]}
        />
      }
      <Modal 
        open={modalIdx >= 0}
        title={<><InfoCircleOutlined style={{ paddingRight: 6 }}/> <span>Details</span></>}
        onCancel={() => setModalView(-1)}
        closable={false}
        cancelText={"Close"}
        okText={"Download"}
        okType="primary"
        width={700}
        // icon={}
      >
        {modalPhoto && 
          <Row gutter={24}>
            <Col span={8}>
              <Statistic title="Filename" value={modalPhoto.name}/>
            </Col>
            <Col span={16}>
              <Statistic title="Tags" value={(modalPhoto.tags || []).join(", ")}/>
            </Col>
            <Col span={24}>
              <Space wrap>
                {(modalPhoto.tags || []).map((tag) => (
                  <Tag
                    key={`${modalPhoto.id}-${tag}`}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      dispatch(removePhotoTag({ id: modalPhoto.id, tag }));
                    }}
                  >
                    {tag}
                  </Tag>
                ))}
              </Space>
              <Space style={{ marginTop: 10 }}>
                <Input
                  placeholder="Add custom tag"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onPressEnter={() => {
                    const tag = customTag.trim().toLowerCase();
                    if (!tag) return;
                    dispatch(addPhotoTag({ id: modalPhoto.id, tag }));
                    setCustomTag("");
                  }}
                />
                <Button
                  type="primary"
                  onClick={() => {
                    const tag = customTag.trim().toLowerCase();
                    if (!tag) return;
                    dispatch(addPhotoTag({ id: modalPhoto.id, tag }));
                    setCustomTag("");
                  }}
                >
                  Add Tag
                </Button>
              </Space>
            </Col>
            <Col span={24}>
              <Statistic title="Description" value={modalPhoto.description || "No AI description"} />
            </Col>
            <Col span={8}>
              <Statistic title="Height" value={modalPhoto.height} suffix="px" prefix={<ColumnHeightOutlined/>}/>
            </Col>
            <Col span={8}>
              <Statistic title="Width" value={modalPhoto.width} suffix="px" prefix={<ColumnWidthOutlined/>}/>
            </Col>
            <Col span={24}>
              {/* <Button> */}
              <Statistic title="URL" valueStyle={{ display: 'none'}} value={""}/>
              <LinkOutlined style={{ paddingRight: 6 }}/>
              <a href={modalPhoto.src}>{modalPhoto.src}</a>
              {/* </Button> */}
            </Col>
          </Row>
      }
      </Modal>
    </>
  );
};


export default PhotoCollage;
