package com.plinthwell.roaamm.db;

import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Reads {@code DATABASE_URL} (mounted from Secret Manager on Cloud Run) at
 * runtime and exposes it as {@code spring.datasource.*}. This runs at startup,
 * not at AOT build time, so it works the same in the native image.
 */
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    static final String VARIABLE = "DATABASE_URL";

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String value = environment.getProperty(VARIABLE);
        if (value == null || value.isBlank()) {
            return;
        }
        DatabaseUrl db = DatabaseUrl.parse(value);
        environment.getPropertySources().addFirst(new MapPropertySource("databaseUrl", Map.of(
                "spring.datasource.url", db.jdbcUrl(),
                "spring.datasource.username", db.username(),
                "spring.datasource.password", db.password())));
    }

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }
}
