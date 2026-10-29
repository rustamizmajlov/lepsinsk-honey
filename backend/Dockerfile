# Этап 1: компилируем C++ сервер с поддержкой PostgreSQL
FROM gcc:14 AS build
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY third_party ./third_party
COPY src ./src
RUN g++ -std=c++17 -O2 -DUSE_POSTGRES -Ithird_party -I/usr/include/postgresql src/*.cpp \
    -o honey-server -lpq -pthread -static-libstdc++ -static-libgcc

# Этап 2: маленький образ только с готовой программой
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libpq5 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/honey-server /usr/local/bin/honey-server
EXPOSE 8000
CMD ["honey-server"]
