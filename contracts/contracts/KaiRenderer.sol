// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Kai} from "./Kai.sol";

/// @title KaiRenderer
/// @notice Fully on-chain JSON + SVG metadata for Kai chickens and Khai eggs ("Night Coop" palette).
contract KaiRenderer {
    using Strings for uint256;

    // 6 hex chars per plumage: White, Black, Buff, Blue, Splash, Partridge, Silver, Gold
    bytes private constant PLUMAGE_HEX = "f2f4f72b303ae8b96a6f86b8c9d3e6a0643ac0c6cfe0a526";
    // Wing / tail accent per plumage
    bytes private constant SHADE_HEX = "c9ced84a5262c48f416a5c9a7c8db0f0b90b7f8794a8701c";

    function breedName(uint8 breed) public pure returns (string memory) {
        if (breed == 0) return "Silkie";
        if (breed == 1) return "Brahma";
        if (breed == 2) return "Serama";
        if (breed == 3) return "Polish";
        if (breed == 4) return "Cochin";
        if (breed == 5) return "Sebright";
        if (breed == 6) return "Orpington";
        if (breed == 7) return "Wyandotte";
        if (breed == 8) return "Leghorn";
        if (breed == 9) return "Sussex";
        return "Unknown";
    }

    function plumageName(uint8 plumage) public pure returns (string memory) {
        if (plumage == 0) return "White";
        if (plumage == 1) return "Black";
        if (plumage == 2) return "Buff";
        if (plumage == 3) return "Blue";
        if (plumage == 4) return "Splash";
        if (plumage == 5) return "Partridge";
        if (plumage == 6) return "Silver";
        if (plumage == 7) return "Gold";
        return "Unknown";
    }

    function bandId(uint256 tokenId) public pure returns (string memory) {
        string memory digits = tokenId.toString();
        uint256 len = bytes(digits).length;
        if (len >= 4) return string.concat("KK-", digits);
        return string.concat("KK-", len == 3 ? "0" : len == 2 ? "00" : "000", digits);
    }

    // ---------------------------------------------------------------- chicken

    function chickenURI(uint256 tokenId, Kai.Bird calldata bird, uint64 carePaidUntil) external view returns (string memory) {
        Kai.Bird calldata b = bird;
        bool active = block.timestamp <= carePaidUntil;
        string memory breed = breedName(b.breed);
        string memory band = bandId(tokenId);
        string memory svg = _chickenSvg(b, breed, band, active);
        string memory json = string.concat(
            '{"name":"Kai #',
            tokenId.toString(),
            unicode" — ",
            breed,
            '","description":"Sponsorship token for one farm chicken. The holder is the sponsor of this bird: they fund its care and can see every care record on-chain. Not legal ownership. Sample data for the BNB Bangkok hackathon demo.","attributes":[',
            _attr("Breed", breed),
            ",",
            _attr("Sex", b.sex == 1 ? "Rooster" : "Hen"),
            ",",
            _attr("Plumage", plumageName(b.plumage)),
            ",",
            _attr("Band", band),
            ",",
            _attr("Care status", active ? "Active" : "Overdue"),
            ',{"trait_type":"Born","display_type":"date","value":',
            uint256(b.bornAt).toString(),
            '}],"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _attr(string memory key, string memory value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":"', value, '"}');
    }

    function _hex(bytes memory table, uint8 i) private pure returns (string memory) {
        uint256 k = uint256(i % 8) * 6;
        bytes memory out = new bytes(7);
        out[0] = "#";
        for (uint256 j; j < 6; ++j) out[j + 1] = table[k + j];
        return string(out);
    }

    function _chickenSvg(Kai.Bird calldata b, string memory breed, string memory band, bool active) private pure returns (string memory) {
        string memory body = _hex(PLUMAGE_HEX, b.plumage);
        string memory shade = _hex(SHADE_HEX, b.plumage);
        bool rooster = b.sex == 1;
        // Bantams (Serama, Sebright) are drawn smaller.
        string memory scale = b.breed == 2 ? "0.72" : b.breed == 5 ? "0.8" : "1";
        return string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
            '<rect width="400" height="400" fill="#0e1116"/>'
            '<rect x="16" y="16" width="368" height="368" rx="28" fill="#161b23"/>'
            '<circle cx="200" cy="210" r="118" fill="#7c5cff" opacity=".14"/>'
            '<ellipse cx="200" cy="318" rx="96" ry="10" fill="#0e1116"/>',
            '<g transform="translate(200 318) scale(',
            scale,
            ') translate(-200 -318)">',
            _tail(rooster, shade),
            _legs(b.breed, body),
            _bodyHead(body, shade),
            _headgear(b.breed, rooster, body),
            "</g>",
            _labels(breed, band, active, rooster)
        );
    }

    function _tail(bool rooster, string memory shade) private pure returns (string memory) {
        if (rooster) {
            return string.concat(
                '<path d="M135 220C95 190 80 130 105 95C110 140 125 170 150 190Z" fill="#7c5cff"/>'
                '<path d="M140 225C90 215 60 165 70 120C85 165 110 190 150 200Z" fill="',
                shade,
                '"/><path d="M145 230C105 235 80 205 78 175C95 205 120 215 152 212Z" fill="#4fe3a1" opacity=".8"/>'
            );
        }
        return string.concat('<path d="M140 215C112 200 102 165 112 140C122 170 138 185 156 192Z" fill="', shade, '"/>');
    }

    function _legs(uint8 breed, string memory body) private pure returns (string memory) {
        string memory legs = '<path d="M185 262V310M218 262V310M172 312H196M206 312H230" stroke="#f0b90b" stroke-width="7" stroke-linecap="round"/>';
        // Feathered feet for Brahma and Cochin (and Silkie).
        if (breed == 1 || breed == 4 || breed == 0) {
            return string.concat(
                legs,
                '<g fill="',
                body,
                '"><ellipse cx="183" cy="300" rx="16" ry="9"/><ellipse cx="220" cy="300" rx="16" ry="9"/></g>'
            );
        }
        return legs;
    }

    function _bodyHead(string memory body, string memory shade) private pure returns (string memory) {
        return string.concat(
            '<ellipse cx="200" cy="222" rx="78" ry="58" fill="',
            body,
            '"/><circle cx="258" cy="160" r="34" fill="',
            body,
            '"/><path d="M168 212C190 196 228 200 238 222C224 250 186 254 168 236Z" fill="',
            shade,
            '"/><path d="M290 154L310 162L290 170Z" fill="#f0b90b"/>'
            '<circle cx="268" cy="152" r="5" fill="#0e1116"/>'
            '<circle cx="270" cy="150" r="1.6" fill="#f2f4f7"/>'
        );
    }

    function _headgear(uint8 breed, bool rooster, string memory body) private pure returns (string memory) {
        string memory comb = rooster
            ? '<path d="M236 134C236 112 246 104 250 118C254 98 266 96 268 116C274 100 288 104 284 124C290 126 288 134 280 136Z" fill="#ff7a6b"/><ellipse cx="286" cy="182" rx="7" ry="12" fill="#ff7a6b"/>'
            : '<path d="M248 130C248 120 256 116 260 124C264 116 274 118 272 130Z" fill="#ff7a6b"/><ellipse cx="286" cy="178" rx="5" ry="7" fill="#ff7a6b"/>';
        // Crest for Silkie and Polish.
        if (breed == 0 || breed == 3) {
            return string.concat(
                comb,
                '<g fill="',
                body,
                '" stroke="#0e1116" stroke-opacity=".25" stroke-width="2"><circle cx="246" cy="126" r="14"/><circle cx="262" cy="118" r="16"/><circle cx="278" cy="128" r="13"/></g>'
            );
        }
        return comb;
    }

    function _labels(string memory breed, string memory band, bool active, bool rooster) private pure returns (string memory) {
        return string.concat(
            '<g font-family="ui-monospace,Menlo,monospace" font-weight="700">'
            '<text x="40" y="62" font-size="24" fill="#f2f4f7">',
            breed,
            '</text><text x="360" y="62" font-size="20" fill="#f0b90b" text-anchor="end">',
            band,
            '</text><text x="40" y="360" font-size="16" fill="#8c95a3">',
            rooster ? "Rooster" : "Hen",
            '</text><rect x="262" y="340" width="98" height="28" rx="14" fill="',
            active ? "#4fe3a1" : "#ff7a6b",
            '" opacity=".18"/><text x="311" y="359" font-size="14" text-anchor="middle" fill="',
            active ? "#4fe3a1" : "#ff7a6b",
            '">',
            active ? "ACTIVE" : "OVERDUE",
            "</text></g></svg>"
        );
    }

    // ---------------------------------------------------------------- egg

    function eggURI() external pure returns (string memory) {
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">'
            '<rect width="400" height="400" fill="#0e1116"/>'
            '<rect x="16" y="16" width="368" height="368" rx="28" fill="#161b23"/>'
            '<circle cx="200" cy="200" r="120" fill="#7c5cff" opacity=".16"/>'
            '<ellipse cx="200" cy="312" rx="70" ry="10" fill="#0e1116"/>'
            '<path d="M200 90C250 90 285 175 285 228C285 280 248 310 200 310C152 310 115 280 115 228C115 175 150 90 200 90Z" fill="#f2f4f7"/>'
            '<path d="M150 150C160 125 175 108 190 102" stroke="#ffffff" stroke-width="8" stroke-linecap="round" fill="none" opacity=".7"/>'
            '<g fill="#f0b90b"><circle cx="230" cy="170" r="9"/><circle cx="175" cy="225" r="7"/><circle cx="240" cy="250" r="11"/><circle cx="205" cy="280" r="5"/></g>'
            '<g font-family="ui-monospace,Menlo,monospace" font-weight="700">'
            '<text x="40" y="62" font-size="24" fill="#f2f4f7">Khai</text>'
            '<text x="360" y="62" font-size="20" fill="#f0b90b" text-anchor="end">EGG</text>'
            '<text x="200" y="360" font-size="15" fill="#8c95a3" text-anchor="middle">hatch to sponsor one farm bird</text>'
            "</g></svg>"
        );
        string memory json = string.concat(
            '{"name":"Khai Egg","description":"A Khai egg is a claim on one random farm chicken from the unsponsored pool. Hatch it on Kai to become the sponsor of that bird. Sample data for the BNB Bangkok hackathon demo.","image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }
}
