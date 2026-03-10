import React, { useEffect } from "react";
import ApexCharts from "apexcharts";

const PopularTagsGraph: React.FC<{ tags: { name: string; count: number }[] }> = ({ tags }) => {
  useEffect(() => {
    const categories = tags.map((t) => t.name);
    const seriesData = tags.map((t) => t.count);
    const options = {
      series: [{ name: "Photos", data: seriesData, color: "#fff" }],
      toolbar: { show: false },
      chart: { height: 330, type: "bar" },
      plotOptions: {
        bar: { borderRadius: 5, dataLabels: { position: "top" } },
      },
      dataLabels: {
        enabled: true,
        formatter: (v: number) => v,
        offsetY: -20,
        style: { fontSize: "12px", colors: ["#ffffff"] },
      },
      grid: {
        show: true,
        borderColor: "#ccc",
        strokeDashArray: 2,
      },
      xaxis: {
        categories,
        position: "top",
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: categories.map(() => "#fff") } },
      },
      yaxis: {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { show: false, formatter: (v: number) => v },
      },
    };
    const chart = new ApexCharts(document.querySelector("#chart"), options);
    chart.render();
    return () => chart.destroy();
  }, [tags]);

  return (
    <div
      id="chart"
      style={{
        background: `transparent linear-gradient(62deg, #00369e 0%, #005cfd 53%, #a18dff 100%) 0% 0% no-repeat`,
        borderRadius: 6,
      }}
    ></div>
  );
};

export default PopularTagsGraph;
