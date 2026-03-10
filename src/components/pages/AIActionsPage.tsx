import React, { useEffect, useState } from 'react';
import { Col, Row, Typography, Tag } from 'antd';

import { checkOnline, getActions, ActionLog } from '../../client/actions';
import { localApiBaseURL } from '../../config/app';
import ActionCard from '../actions/ActionCard';
import { userID } from '../../config/app';

const { Text } = Typography;

const AIActionsPage = () => {
  const [online, setOnline] = useState(false);
  const [actions, setActions] = useState<ActionLog[]>([]);
  
  const load = () => {
    checkOnline().then((status) => {
      setOnline(status);
    });
    getActions(userID).then(setActions).catch(() => setActions([]));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Row>
      <Col span={24} style={{ marginBottom: 10 }}>
        <Tag color={online ? "green" : "red"}>{online ? "Services online" : "Services offline"}</Tag>
        <Text type="secondary" style={{ marginRight: 10 }}>{localApiBaseURL}</Text>
        <Text type="secondary">{actions.length} action(s)</Text>
      </Col>
      {actions.map(action => (
        <Col span={24} key={action.id}>
          <ActionCard action={action}/>
        </Col>
      ))}
    </Row>
  );
};

export default AIActionsPage;
