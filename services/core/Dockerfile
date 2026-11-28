# ROAAMM core: Spring Boot 4 compiled to a GraalVM native image.
#
#   docker build -t roaamm-core services/core
#   docker run --rm -p 8080:8080 -e PORT=8080 roaamm-core
#
# Stage 1 builds with the Gradle wrapper inside GraalVM (Java 25), so the
# build needs nothing installed on the host. Stage 2 is a minimal distroless
# image (glibc, no shell) that runs the binary as a non-root user.
# Cloud Run sets $PORT; application.yml reads it (default 8080).
# Fallback if native ever breaks: build with `./gradlew bootJar` and run the
# jar on eclipse-temurin:25-jre (see docs/adr/0003-core-hosting-cloud-run.md).

FROM ghcr.io/graalvm/native-image-community:25@sha256:0d936f32bb8acb5bc60c41b33e05f064d7a6aaf36b726538296c54949bd4a3c0 AS build
WORKDIR /src
# Wrapper and build scripts first, so the Gradle download is cached.
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN ./gradlew --no-daemon --version
COPY src src
RUN ./gradlew --no-daemon nativeCompile

FROM gcr.io/distroless/base-debian13:nonroot@sha256:7088bf1cdc94a65af4e0d5ad94518ed489a372dec1ece38ff4411c6c15fb5864
COPY --from=build /src/build/native/nativeCompile/roaamm-core /app/roaamm-core
# Flyway cannot scan classpath resources inside a native image ("unsupported
# protocol: resource"), so the migrations ship as plain files next to the binary.
COPY src/main/resources/db/migration /app/db/migration
# 65532 is the distroless "nonroot" user.
USER 65532:65532
ENV PORT=8080
ENV SPRING_FLYWAY_LOCATIONS=filesystem:/app/db/migration
EXPOSE 8080
ENTRYPOINT ["/app/roaamm-core"]
