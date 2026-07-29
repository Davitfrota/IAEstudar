"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Point = { label: string; value: number };

type Props = {
  title: string;
  description?: string;
  data: Point[];
  color?: string;
};

export function NeoBarChart({
  title,
  description,
  data,
  color = "var(--chart-1)",
}: Props) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-64 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#000" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#000", strokeWidth: 2 }}
              tick={{ fill: "#000", fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={{ stroke: "#000", strokeWidth: 2 }}
              tick={{ fill: "#000", fontSize: 12, fontWeight: 600 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.06)" }}
              contentStyle={{
                border: "2px solid #000",
                borderRadius: 5,
                boxShadow: "4px 4px 0 #000",
                background: "#FFF3B0",
                fontWeight: 700,
              }}
            />
            <Bar dataKey="value" fill={color} stroke="#000" strokeWidth={2} radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
