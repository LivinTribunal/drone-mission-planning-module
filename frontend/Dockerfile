# stage 1: build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_CESIUM_ION_TOKEN
ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN
RUN npm run build

# stage 2: serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
