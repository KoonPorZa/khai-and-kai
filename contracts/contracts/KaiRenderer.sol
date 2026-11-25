// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Kai} from "./Kai.sol";
import {KaiArt} from "./KaiArt.sol";

/// @title KaiRenderer
/// @notice Fully on-chain JSON + SVG metadata for Kai chickens and Khai eggs ("Night Coop" palette).
/// The SVG shapes come from design/svg/kit.json via the generated KaiArt library.
contract KaiRenderer {
    using Strings for uint256;

    error InvalidTraits();

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
        _checkTraits(b.breed, b.sex, b.plumage);
        bool active = block.timestamp <= carePaidUntil;
        string memory breed = breedName(b.breed);
        string memory band = bandId(tokenId);
        string memory svg = _chickenSvg(b.breed, b.sex, b.plumage, band, breed);
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

    /// @dev Mirrors design/svg/compose.mjs composeChicken() byte for byte, using the tables in KaiArt.
    function _chickenSvg(uint8 breed, uint8 sex, uint8 plumage, string memory band, string memory name) private pure returns (string memory) {
        bytes memory tt = KaiArt.TRANSFORM_TABLE;
        return string(
            bytes.concat(
                KaiArt.HEAD,
                _slice(KaiArt.TRANSFORMS, _u16(tt, uint256(breed) * 2), _u16(tt, uint256(breed) * 2 + 2)),
                _body(breed, sex, plumage),
                KaiArt.BEFORE_BAND,
                bytes(band),
                KaiArt.BEFORE_NAME,
                bytes(name),
                KaiArt.END
            )
        );
    }

    function _body(uint8 breed, uint8 sex, uint8 plumage) private pure returns (bytes memory out) {
        bytes memory shapes = KaiArt.SHAPES;
        bytes memory st = KaiArt.SHAPE_TABLE;
        bytes memory pt = KaiArt.PART_TABLE;
        bytes memory ct = KaiArt.COMBO_TABLE;
        bytes memory cp = KaiArt.COMBO_PARTS;
        bytes memory pal = KaiArt.PALETTE;
        out = new bytes(KaiArt.MAX_BODY);
        uint256 len;
        uint256 combo = uint256(breed) * 2 + sex;
        uint256 colourBase = uint256(plumage) * KaiArt.SLOT_COUNT;
        for (uint256 i = uint8(ct[combo]); i < uint8(ct[combo + 1]); ++i) {
            uint256 part = uint8(cp[i]);
            for (uint256 s = uint8(pt[part]); s < uint8(pt[part + 1]); ++s) {
                uint256 from = _u16(st, s * 3);
                uint256 n = _u16(st, s * 3 + 3) - from;
                _copy(out, len, shapes, from, n);
                len += n;
                _copy(out, len, pal, (colourBase + uint8(st[s * 3 + 2])) * 7, 7);
                len += 7;
                out[len] = '"';
                out[len + 1] = "/";
                out[len + 2] = ">";
                len += 3;
            }
        }
        assembly ("memory-safe") {
            mstore(out, len)
        }
    }

    function _u16(bytes memory b, uint256 i) private pure returns (uint256) {
        return (uint256(uint8(b[i])) << 8) | uint8(b[i + 1]);
    }

    function _slice(bytes memory src, uint256 from, uint256 to) private pure returns (bytes memory out) {
        out = new bytes(to - from);
        _copy(out, 0, src, from, to - from);
    }

    function _copy(bytes memory dst, uint256 dstOff, bytes memory src, uint256 srcOff, uint256 n) private pure {
        if (srcOff + n > src.length || dstOff + n > dst.length) revert InvalidTraits();
        assembly ("memory-safe") {
            mcopy(add(add(dst, 32), dstOff), add(add(src, 32), srcOff), n)
        }
    }

    // ---------------------------------------------------------------- egg

    function eggURI() external pure returns (string memory) {
        string memory json = string.concat(
            '{"name":"Khai Egg","description":"A Khai egg is a claim on one random farm chicken from the unsponsored pool. Hatch it on Kai to become the sponsor of that bird. Sample data for the BNB Bangkok hackathon demo.","image":"data:image/svg+xml;base64,',
            Base64.encode(KaiArt.EGG_SVG),
            '"}'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @notice The raw chicken SVG (same bytes as design/svg/compose.mjs composeChicken).
    function chickenSvg(uint256 tokenId, uint8 breed, uint8 sex, uint8 plumage) external pure returns (string memory) {
        _checkTraits(breed, sex, plumage);
        return _chickenSvg(breed, sex, plumage, bandId(tokenId), breedName(breed));
    }

    /// @notice The raw egg SVG (same bytes as design/svg/compose.mjs composeEgg).
    function eggSvg() external pure returns (string memory) {
        return string(KaiArt.EGG_SVG);
    }

    function _checkTraits(uint8 breed, uint8 sex, uint8 plumage) private pure {
        if (breed > 9 || sex > 1 || plumage > 7) revert InvalidTraits();
    }
}
