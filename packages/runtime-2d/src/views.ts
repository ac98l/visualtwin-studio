import type { Component } from 'vue'
import type { ScreenComponentType } from './registry'
import ChartView from './ChartView.vue'
import TextView from './TextView.vue'
import NumberView from './NumberView.vue'
import BorderView from './BorderView.vue'
import DecorationView from './DecorationView.vue'
import TableView from './TableView.vue'

export const views: Record<ScreenComponentType, Component> = {
  'chart.bar': ChartView, 'chart.line': ChartView, 'chart.pie': ChartView,
  'widget.text': TextView, 'widget.number': NumberView, 'screen.border': BorderView, 'screen.decoration': DecorationView, 'screen.table': TableView
}
