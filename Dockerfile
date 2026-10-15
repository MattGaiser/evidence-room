FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json vite.config.ts index.html ./
COPY web ./web
RUN npx tsc -b && VITE_HOSTED_DEMO=1 npx vite build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /app
COPY Directory.Build.props ./
COPY server/EvidenceRoom.Api ./server/EvidenceRoom.Api
RUN dotnet restore server/EvidenceRoom.Api --locked-mode && dotnet publish server/EvidenceRoom.Api -c Release -o /out --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend /out ./server
COPY --from=frontend /app/dist ./dist
COPY data/competition.json ./data/competition.json
COPY worker/review.py ./worker/review.py
ENV EVIDENCE_ROOT=/app PYTHON_EXECUTABLE=python3
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "/app/server/EvidenceRoom.Api.dll"]
