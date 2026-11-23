package com.plinthwell.roaamm.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.plinthwell.roaamm.passkey.PasskeyException;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class PlainTextTest {

    @Test
    void linesAreTrimmedCollapsedAndBounded() {
        assertThat(PlainText.line("  a   b \t c ", 10)).isEqualTo("a b c");
        assertThat(PlainText.line("é".repeat(5), 5)).isEqualTo("ééééé");
        assertThat(PlainText.line("x".repeat(6), 5)).isNull();
        assertThat(PlainText.line("   ", 5)).isNull();
        assertThat(PlainText.line(null, 5)).isNull();
        assertThat(PlainText.line("a<b", 5)).isNull();
        assertThat(PlainText.line("a​b", 5)).isNull();
        assertThat(PlainText.line("a\u0000b", 5)).isNull();
    }

    @Test
    void blocksKeepAtMostTwoLineBreaks() {
        assertThat(PlainText.block("one\r\n\r\n\r\n\r\ntwo  \n   three", 50)).isEqualTo("one\n\ntwo\nthree");
        assertThat(PlainText.block("a\u0007", 50)).isNull();
        assertThat(PlainText.block("\n\n", 50)).isNull();
    }

    @Test
    void placesAreLettersOnly() {
        assertThat(PlainText.place("kyoto ,  japan", 80, true)).isEqualTo("kyoto, japan");
        assertThat(PlainText.place("Saint-Étienne", 40, false)).isEqualTo("Saint-Étienne");
        assertThat(PlainText.place("L'Aquila", 40, false)).isEqualTo("L'Aquila");
        assertThat(PlainText.place("東京", 40, false)).isEqualTo("東京");
        for (String bad : List.of("Kyoto, Japan", "Route 66", "a@b", "-Kyoto", "www.example.com/x")) {
            assertThat(PlainText.place(bad, 40, false)).as(bad).isNull();
        }
        assertThat(PlainText.place("A, B, C, D", 80, true)).isNull();
        assertThat(PlainText.place("Kyoto,", 80, true)).isNull();
    }

    @Test
    void searchPatternsEscapeWildcards() {
        assertThat(PlainText.searchPattern(null)).isNull();
        assertThat(PlainText.searchPattern("  ")).isNull();
        assertThat(PlainText.searchPattern("50%_off\\")).isEqualTo("%50\\%\\_off\\\\%");
        assertThatThrownBy(() -> PlainText.searchPattern("x".repeat(41))).isInstanceOf(PasskeyException.class);
    }

    @Test
    void bulkIdsAreCappedAndDeduplicated() {
        UUID a = UUID.randomUUID();
        assertThat(BulkIds.parse(List.of(a.toString(), a.toString()))).containsExactly(a);
        assertThatThrownBy(() -> BulkIds.parse(List.of())).isInstanceOf(PasskeyException.class);
        assertThatThrownBy(() -> BulkIds.parse(null)).isInstanceOf(PasskeyException.class);
        assertThatThrownBy(() -> BulkIds.parse(java.util.Arrays.asList((String) null)))
                .isInstanceOf(PasskeyException.class);
        assertThatThrownBy(() -> BulkIds.parse(IntStream.range(0, 26).mapToObj(i -> UUID.randomUUID().toString())
                .toList())).isInstanceOf(PasskeyException.class);
    }
}
