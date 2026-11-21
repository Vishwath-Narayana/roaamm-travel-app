# Runtime image only. CI builds the native binary first (gradle nativeCompile)
# on an Ubuntu runner, so the runtime must have a compatible glibc.
FROM ubuntu:24.04
RUN useradd --system --uid 10001 --no-create-home roaamm
COPY build/native/nativeCompile/roaamm-core /app/roaamm-core
USER 10001
EXPOSE 8080
ENTRYPOINT ["/app/roaamm-core"]
