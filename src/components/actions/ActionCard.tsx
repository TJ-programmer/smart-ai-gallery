import { QuestionOutlined } from "@ant-design/icons";
import { Button, Card, Typography } from "antd";
import React from "react";
import {
  AppstoreTwoTone,
  DeleteTwoTone,
  ExclamationCircleTwoTone,
  FileImageTwoTone,
  FolderOpenTwoTone,
} from "@ant-design/icons";
import { ActionLog } from "../../client/actions";

const { Text } = Typography;

const getActionIcon = (type: string) => {
  if (type === "photo_upload") {
    return <FileImageTwoTone style={{ fontSize: 34, paddingTop: 6 }} twoToneColor="orange" />;
  }
  if (type === "photo_delete") {
    return <DeleteTwoTone style={{ fontSize: 34, paddingTop: 6 }} twoToneColor="#ff4d4f" />;
  }
  if (type === "album_create" || type === "album_delete") {
    return <FolderOpenTwoTone style={{ fontSize: 34, paddingTop: 6 }} twoToneColor="#1677ff" />;
  }
  if (type.includes("error")) {
    return <ExclamationCircleTwoTone style={{ fontSize: 34, paddingTop: 6 }} twoToneColor="#ff4d4f" />;
  }
  return <AppstoreTwoTone style={{ fontSize: 34, paddingTop: 6 }} twoToneColor="#52c41a" />;
};

const ActionCard: React.FC<{ action: ActionLog }> = ({ action }) => {
  const date = new Date(action.date);
  return (
    <Card
      hoverable
      title={<Text strong>{action.title}</Text>}
      extra={<Button type="text" icon={<QuestionOutlined />} />}
      style={{ margin: 10 }}
    >
      <Card.Meta
        avatar={getActionIcon(action.type)}
        description={`${date.toDateString()} | ${date
          .toTimeString()
          .substring(0, 12)} (${action.responseTime} ms)`}
        title={action.description || action.type}
      />
    </Card>
  );
};

export default ActionCard;
