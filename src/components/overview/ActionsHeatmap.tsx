import React, { useEffect, useState } from "react";
import { Heatmap } from "@ant-design/plots";
import { HeatmapConfig } from "@ant-design/charts";
import { ActionLog } from "../../client/actions";

type HeatmapDatum = {
  week: string;
  day: string;
  commits: number;
  date: string;
};

const ActionsHeatmap: React.FC<{ actions: ActionLog[] }> = ({ actions }) => {
    const [data, setData] = useState<HeatmapDatum[]>([]);
    useEffect(() => {
      const counts = new Map<string, number>();
      actions.forEach((action) => {
        const d = new Date(action.date);
        const day = d.toLocaleDateString("en-US", { weekday: "long" });
        const week = `${d.getFullYear()}-W${Math.ceil((d.getDate() + 6 - d.getDay()) / 7)}`;
        const key = `${week}__${day}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      });

      const parsed: HeatmapDatum[] = Array.from(counts.entries()).map(([key, commits]) => {
        const [week, day] = key.split("__");
        return { week, day, commits, date: `${week} ${day}` };
      });
      setData(parsed);
    }, [actions]);
    
    const config: HeatmapConfig = {
      data,
      height: 200,
      autoFit: true,
      xField: "week",
      yField: "day",
      colorField: "commits",
      reflect: "y",
      theme: "light",
      shape: "boundary-polygon",
      meta: {
        day: {
          type: "cat",
          values: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        },
        week: {
          type: "cat",
        },
        commits: {
          sync: true,
        },
        date: {
          type: "cat",
        },
      },
      yAxis: {
        grid: null,
      },
      tooltip: {
        title: "date",
        showMarkers: false,
      },
      interactions: [
        {
          type: "element-active",
        },
      ],
      xAxis: {
        position: "top",
        tickLine: null,
        line: null,
        label: {
          offset: 12,
          style: {
            fontSize: 12,
            fill: "#111",
            textBaseline: "top",
          },
          formatter: (val) => String(val).replace("-", " "),
        },
      },
    };
    
    return <Heatmap {...config} />;
}

export default ActionsHeatmap
