{{- define "async-service-monitor.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "async-service-monitor.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" (include "async-service-monitor.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "async-service-monitor.labels" -}}
app.kubernetes.io/name: {{ include "async-service-monitor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: service-health-portal
app.kubernetes.io/component: control-plane
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "async-service-monitor.selectorLabels" -}}
app.kubernetes.io/name: {{ include "async-service-monitor.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: control-plane
{{- end -}}

{{- define "async-service-monitor.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "async-service-monitor.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "async-service-monitor.providerConfig" -}}
{{- $provider := .Values.cloud.provider | default "generic" -}}
{{- if and (ne $provider "generic") (hasKey .Values.providers $provider) -}}
{{- index .Values.providers $provider | toYaml -}}
{{- else -}}
{}
{{- end -}}
{{- end -}}
