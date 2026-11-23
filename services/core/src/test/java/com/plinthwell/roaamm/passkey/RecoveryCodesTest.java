package com.plinthwell.roaamm.passkey;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import org.junit.jupiter.api.Test;

class RecoveryCodesTest {

    @Test
    void codesAreUnambiguousAndNormalize() {
        var codes = RecoveryCodes.generate();
        assertThat(codes).hasSize(8);
        assertThat(new HashSet<>(codes)).hasSize(8);
        for (String c : codes) {
            assertThat(c).matches("[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}(-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}){3}");
            assertThat(RecoveryCodes.normalize(c.toLowerCase().replace("-", " "))).isEqualTo(c.replace("-", ""));
        }
        assertThat(RecoveryCodes.ALPHABET).doesNotContain("0", "O", "1", "I", "L", "U", "V");
        assertThat(RecoveryCodes.normalize("0000-0000-0000-0000")).isNull();
        assertThat(RecoveryCodes.normalize("ABCD")).isNull();
        assertThat(RecoveryCodes.normalize(null)).isNull();
    }

    @Test
    void displayNamesAreTrimmedAndPlain() {
        assertThat(DisplayNames.clean("  Asha \n Rao ")).isEqualTo("Asha Rao");
        assertThat(DisplayNames.clean("Zoë 山田")).isEqualTo("Zoë 山田");
        assertThat(DisplayNames.clean("x".repeat(40))).hasSize(40);
        for (String bad : new String[] {null, "", "  ", "x".repeat(41), "<script>", "a>b", "a&amp;", "a‮b"}) {
            assertThat(DisplayNames.clean(bad)).as(String.valueOf(bad)).isNull();
        }
    }
}
