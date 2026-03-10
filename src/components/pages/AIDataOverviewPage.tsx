import React, { useEffect, useState } from "react";
import { Typography, Card, Col, Row } from "antd";

import {
  blue,
  volcano,
  purple,
  green,
  orange,
} from "@ant-design/colors";
import ActionsHeatmap from "../overview/ActionsHeatmap";
import {
  DatabaseOutlined,
  FileImageOutlined,
  TagOutlined,
  UsergroupAddOutlined,
} from "@ant-design/icons";

import { selectAllPhotos } from "../../store/photos";
import { useAppSelector } from "../../store";
import { selectPeople } from "../../store/people";
import StatisticCard from "../overview/StatisticCard";
import PopularTagsGraph from "../overview/PopularTagsGraph";
import ActionsTimeline from "../overview/ActionsTimeline";
import { getActions, getStats, ActionLog, StatsResponse } from "../../client/actions";
import { userID } from "../../config/app";
const { Text } = Typography;
const AIOverviewPage = () => {
  const photos = useAppSelector(selectAllPhotos);
  const people = useAppSelector(selectPeople);
  const [actions, setActions] = useState<ActionLog[]>([]);
  const [stats, setStats] = useState<StatsResponse>({
    photosProcessed: 0,
    tagsAssigned: 0,
    storageBytes: 0,
    albums: 0,
    actions: 0,
  });

  useEffect(() => {
    getActions(userID).then(setActions).catch(() => setActions([]));
    getStats(userID).then(setStats).catch(() => {});
  }, [Object.keys(photos).length]);

  const numPhotos = Object.keys(photos).length;
  const uniquePeople = Object.keys(people).length;
  const tagCounts = new Map<string, number>();
  Object.values(photos).forEach((photo) => {
    photo.tags.forEach((tag) => {
      const key = tag.trim();
      if (!key) return;
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    });
  });
  const topTags = Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7);
  const facesDetected = Object.values(people).reduce((sum, p) => sum + p.photoIDs.length, 0);
  const storageMb = `${(stats.storageBytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <>
      <Row gutter={[18, 18]}>
        <StatisticCard
          title="Photos Processed"
          value={numPhotos}
          color={volcano[5]}
          width={4}
          icon={<FileImageOutlined style={{ fontSize: 28 }} />}
        />
        <StatisticCard
          title="Tags Assigned"
          value={stats.tagsAssigned}
          color={green[5]}
          width={4}
          icon={<TagOutlined style={{ fontSize: 28 }} />}
        />
        <StatisticCard
          title="Faces Detected"
          value={facesDetected}
          color={blue[5]}
          width={4}
          icon={<UsergroupAddOutlined style={{ fontSize: 28 }} />}
        />
        <StatisticCard
          title="Storage Used"
          value={storageMb}
          color={purple[5]}
          width={6}
          icon={<DatabaseOutlined style={{ fontSize: 28 }} />}
        />
        <StatisticCard
          title="Unique People"
          value={uniquePeople}
          color={orange[5]}
          width={6}
          icon={<FileImageOutlined style={{ fontSize: 30 }} />}
        />
        {/* </Row>
      <Row> */}
        <Col span={9}>
          <Card
            hoverable
            title="Tags"
            bodyStyle={{ padding: 13, paddingBottom: 0 }}
          >
            <PopularTagsGraph tags={topTags} />
            <Text
              strong
              style={{
                position: "relative",
                display: "table",
                bottom: 30,
                color: "white",
                fontSize: 15,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              Top 7 Popular This Year
            </Text>
          </Card>
        </Col>
        <Col span={9}>
          <Card hoverable title="Actions">
            <ActionsHeatmap actions={actions} />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable title="Timeline">
            <ActionsTimeline actions={actions.slice(0, 8)} />
          </Card>
        </Col>
        {/* </Row>    
      <Row> */}
        <Col span={8}>
          <Card hoverable title="About">
            About Text
          </Card>
        </Col>
        <Col span={10}></Col>
      </Row>
    </>
  );
};

export default AIOverviewPage;
