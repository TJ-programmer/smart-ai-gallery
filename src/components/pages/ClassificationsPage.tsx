import React, { useEffect, useMemo, useState } from "react";
import { Card, Col, Empty, Image, Row, Space, Tag, Typography } from "antd";
import { useSearchParams } from "react-router-dom";
import { useAppSelector } from "../../store";
import { selectAllPhotos } from "../../store/photos";
import { getPhotos } from "../../client/photos";
import { userID } from "../../config/app";
import { PhotosMap } from "../../models/Photo";

const { Title, Text, Paragraph } = Typography;

type Cluster = {
  key: string;
  photoIDs: string[];
  tags: string[];
  descriptions: string[];
};

const normalizeTags = (raw: unknown): string[] => {
  if (Array.isArray(raw)) {
    return raw.map((t) => String(t).trim()).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
};

const ClassificationsPage: React.FC = () => {
  const allPhotos = useAppSelector(selectAllPhotos);
  const [fallbackPhotos, setFallbackPhotos] = useState<PhotosMap>({});
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  useEffect(() => {
    if (Object.keys(allPhotos).length > 0) return;
    getPhotos(userID)
      .then((data) => setFallbackPhotos(data))
      .catch(() => setFallbackPhotos({}));
  }, [allPhotos]);

  const sourcePhotos = Object.keys(allPhotos).length > 0 ? allPhotos : fallbackPhotos;

  const buildClusters = (searchText: string) => {
    const grouped = new Map<string, Cluster>();
    Object.entries(sourcePhotos).forEach(([photoID, photo]) => {
      const tags = normalizeTags((photo as any).tags);
      const description = typeof (photo as any).description === "string" ? (photo as any).description : "";
      const matchText = `${photo.name || ""} ${tags.join(" ")} ${description}`.toLowerCase();
      if (searchText && !matchText.includes(searchText)) return;

      const groupKeys = tags.length > 0 ? tags.map((t) => t.trim().toLowerCase()).filter(Boolean) : ["unclassified"];
      groupKeys.forEach((key) => {
        const existing = grouped.get(key) || {
          key,
          photoIDs: [],
          tags: [],
          descriptions: [],
        };
        if (!existing.photoIDs.includes(photoID)) {
          existing.photoIDs.push(photoID);
        }
        existing.tags.push(...tags);
        if (description) existing.descriptions.push(description);
        grouped.set(key, existing);
      });
    });

    return Array.from(grouped.values())
      .sort((a, b) => b.photoIDs.length - a.photoIDs.length)
      .map((cluster) => {
        const uniqTags = Array.from(new Set(cluster.tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
        return { ...cluster, tags: uniqTags };
      });
  };

  const clusters = useMemo(() => {
    const filtered = buildClusters(q);
    if (filtered.length === 0 && q) {
      return buildClusters("");
    }
    return filtered;
  }, [sourcePhotos, q]);

  if (clusters.length === 0) {
    return <Empty description="No classification groups found" />;
  }

  return (
    <Space direction="vertical" size={18} style={{ width: "100%" }}>
      <Title level={4} style={{ margin: 0 }}>
        Classification Groups
      </Title>
      <Text type="secondary">
        Photos are grouped by dominant predicted tag. Search filters tags and descriptions.
      </Text>
      <Row gutter={[14, 14]}>
        {clusters.map((cluster) => (
          <Col key={cluster.key} span={24}>
            <Card
              title={`${cluster.key.toUpperCase()} (${cluster.photoIDs.length})`}
              bodyStyle={{ paddingTop: 10 }}
            >
              <Space wrap size={[8, 8]}>
                {cluster.tags.slice(0, 12).map((tag) => (
                  <Tag key={`${cluster.key}-${tag}`} color="blue">
                    {tag}
                  </Tag>
                ))}
              </Space>
              <Paragraph style={{ marginTop: 12, marginBottom: 0 }}>
                {cluster.descriptions.length > 0
                  ? cluster.descriptions.slice(0, 2).join(" ")
                  : "No generated descriptions available in this cluster yet."}
              </Paragraph>
              <Space wrap size={[8, 8]} style={{ marginTop: 12 }}>
                {cluster.photoIDs.slice(0, 8).map((photoID) => {
                  const photo = sourcePhotos[photoID];
                  if (!photo) return null;
                  return (
                    <Image
                      key={`${cluster.key}-${photoID}`}
                      src={photo.src}
                      width={90}
                      height={90}
                      style={{ objectFit: "cover", borderRadius: 8 }}
                      preview={false}
                    />
                  );
                })}
              </Space>
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
};

export default ClassificationsPage;
