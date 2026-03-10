import { Typography, Space, Timeline } from "antd";
import React from "react";
import { ExclamationCircleOutlined } from "@ant-design/icons";
import { ActionLog } from "../../client/actions";

const { Text } = Typography;

const ActionsTimeline: React.FC<{ actions: ActionLog[] }> = ({ actions }) => {
  return (
    <Timeline
      items={actions.map((a) => {
        const date = new Date(a.date);
        const isError = a.type.includes("error");
        const color = isError ? "red" : a.type.includes("delete") ? "orange" : "blue";
        const dot = isError ? <ExclamationCircleOutlined style={{ fontSize: 20 }} /> : undefined;
        return {
          children: (
            <Space direction="vertical" size={0}>
              <Text>{a.title}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {date.toLocaleString()}
              </Text>
            </Space>
          ),
          color,
          dot,
        };
      })}
    />
  );
};

export default ActionsTimeline;
