package com.plinthwell.roaamm.db;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

// Every value here is a made-up placeholder, not a real database.
class DatabaseUrlTest {

    @Test
    void parsesNeonStyleUri() {
        DatabaseUrl db = DatabaseUrl.parse(
                "postgresql://app_user:s3cret@ep-example-pooler.example.test/appdb?sslmode=require&channel_binding=require");
        assertThat(db.jdbcUrl()).isEqualTo(
                "jdbc:postgresql://ep-example-pooler.example.test/appdb?sslmode=require&channelBinding=require");
        assertThat(db.username()).isEqualTo("app_user");
        assertThat(db.password()).isEqualTo("s3cret");
    }

    @Test
    void keepsPortAndDecodesPercentEncodedCredentials() {
        DatabaseUrl db = DatabaseUrl.parse("postgres://us%40er:p%3Aa%2Fss+w@localhost:5433/db");
        assertThat(db.jdbcUrl()).isEqualTo("jdbc:postgresql://localhost:5433/db");
        assertThat(db.username()).isEqualTo("us@er");
        assertThat(db.password()).isEqualTo("p:a/ss+w");
    }

    @Test
    void passwordIsOptional() {
        DatabaseUrl db = DatabaseUrl.parse("postgresql://user@localhost/db");
        assertThat(db.password()).isEmpty();
    }

    @Test
    void rejectsBadInputWithoutEchoingIt() {
        for (String bad : new String[] {
                "", "mysql://u:p@h/db", "postgresql://u:hunter2@/db", "postgresql://h/db",
                "postgresql://u:hunter2@h", "postgresql://u:hunter2@h/", "not a uri at all ::"}) {
            assertThatThrownBy(() -> DatabaseUrl.parse(bad))
                    .isInstanceOf(IllegalArgumentException.class)
                    .satisfies(e -> assertThat(e.getMessage()).doesNotContain("hunter2"));
        }
    }

    @Test
    void toStringNeverShowsThePassword() {
        assertThat(DatabaseUrl.parse("postgresql://u:hunter2@h/db").toString()).doesNotContain("hunter2");
    }
}
