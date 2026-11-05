import type { Component } from 'vue'
import type { ComponentType } from './registry'
import ChartView from './ChartView.vue'
import TextView from './TextView.vue'
import NumberView from './NumberView.vue'

export const views: Record<ComponentType, Component> = {
  'chart.bar': ChartView, 'chart.line': ChartView, 'chart.pie': ChartView,
  'widget.text': TextView, 'widget.number': NumberView
}
