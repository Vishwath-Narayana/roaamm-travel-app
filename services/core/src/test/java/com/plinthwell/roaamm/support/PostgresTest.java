package com.plinthwell.roaamm.support;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.testcontainers.DockerClientFactory;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Full application against a throwaway Postgres in Docker. One container for
 * the whole test run (Spring caches contexts across classes). Needs no Neon
 * and no secret. Skipped only where Docker is missing; CI runners have it.
 */
// The per-IP API limits are in memory and this context is shared by every
// test class, so they are raised here; ApiRateLimitTest checks them with low values.
@SpringBootTest(properties = {
    "roaamm.api-rate-limit.read.max-per-window=100000",
    "roaamm.api-rate-limit.trip-write.max-per-window=100000",
    "roaamm.api-rate-limit.guide-apply.max-per-window=100000",
    "roaamm.api-rate-limit.admin-write.max-per-window=100000",
})
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
public abstract class PostgresTest {

    @ServiceConnection
    protected static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine");

    static {
        if (DockerClientFactory.instance().isDockerAvailable()) {
            POSTGRES.start();
        }
    }
}
